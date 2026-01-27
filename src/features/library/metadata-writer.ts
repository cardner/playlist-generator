/**
 * Metadata writeback adapters and fallback behavior
 */

import type { LibraryFile } from "@/lib/library-selection";
import type { WritebackPayload, WritebackTarget } from "./metadata-writeback";
import { writeSidecarMetadata } from "./metadata-sidecar";
import { logger } from "@/lib/logger";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export interface WritebackResult {
  success: boolean;
  target: WritebackTarget;
  warnings?: string[];
  error?: string;
}

const FFMPEG_EXTENSIONS = new Set(["m4a", "aac", "alac", "flac"]);
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      const instance = new FFmpeg();
      await instance.load();
      ffmpegInstance = instance;
      return instance;
    })();
  }
  return ffmpegLoading;
}

export function requiresFfmpeg(extension: string): boolean {
  return FFMPEG_EXTENSIONS.has(extension);
}

export async function preloadFfmpeg(): Promise<void> {
  await getFFmpeg();
}

function buildFfmpegMetadataArgs(payload: WritebackPayload): string[] {
  const args: string[] = [];
  const add = (key: string, value?: string) => {
    if (!value) return;
    args.push("-metadata", `${key}=${value}`);
  };

  const { tags, bpm, mood, tempoCategory } = payload;
  add("title", tags.title);
  add("artist", tags.artist);
  add("album", tags.album);
  if (tags.genres?.length) {
    add("genre", tags.genres.join("; "));
  }
  if (tags.year) {
    add("date", String(tags.year));
  }
  if (tags.trackNo) {
    add("track", String(tags.trackNo));
  }
  if (tags.discNo) {
    add("disc", String(tags.discNo));
  }
  if (bpm) {
    add("bpm", String(bpm));
  }

  const commentParts: string[] = [];
  if (mood?.length) {
    commentParts.push(`mood=${mood.join(", ")}`);
  }
  if (tempoCategory) {
    commentParts.push(`tempo=${tempoCategory}`);
  }
  if (commentParts.length > 0) {
    add("comment", commentParts.join(" | "));
  }

  return args;
}

async function writeMp3Tags(
  file: LibraryFile,
  payload: WritebackPayload
): Promise<ArrayBuffer> {
  const mod = await import("browser-id3-writer");
  const ID3Writer =
    (mod as { ID3Writer?: unknown }).ID3Writer ??
    (mod as { default?: { ID3Writer?: unknown } }).default?.ID3Writer ??
    (mod as { default?: unknown }).default;
  if (typeof ID3Writer !== "function") {
    throw new TypeError("ID3Writer is not a constructor");
  }
  const arrayBuffer = await file.file.arrayBuffer();
  const writer = new (ID3Writer as new (buffer: ArrayBuffer) => any)(arrayBuffer);

  const { tags } = payload;
  if (tags.title) {
    writer.setFrame("TIT2", tags.title);
  }
  if (tags.artist) {
    writer.setFrame("TPE1", [tags.artist]);
  }
  if (tags.album) {
    writer.setFrame("TALB", tags.album);
  }
  if (tags.genres?.length) {
    writer.setFrame("TCON", tags.genres);
  }
  if (tags.year) {
    writer.setFrame("TYER", String(tags.year));
  }
  if (tags.trackNo) {
    writer.setFrame("TRCK", String(tags.trackNo));
  }
  if (tags.discNo) {
    writer.setFrame("TPOS", String(tags.discNo));
  }
  if (payload.bpm) {
    writer.setFrame("TBPM", String(payload.bpm));
  }
  if (payload.mood?.length) {
    writer.setFrame("TXXX", {
      description: "MOOD",
      value: payload.mood.join("; "),
    });
  }

  writer.addTag();
  return writer.arrayBuffer;
}

async function writeWithFfmpeg(
  file: LibraryFile,
  payload: WritebackPayload
): Promise<ArrayBuffer> {
  if (typeof window === "undefined") {
    throw new Error("FFmpeg writeback is only available in the browser.");
  }

  const ffmpeg = await getFFmpeg();
  const inputName = `input.${file.extension}`;
  const outputName = `output.${file.extension}`;
  const metadataArgs = buildFfmpegMetadataArgs(payload);

  await ffmpeg.writeFile(inputName, await fetchFile(file.file));
  await ffmpeg.exec(["-i", inputName, "-c", "copy", ...metadataArgs, outputName]);
  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  if (typeof data === "string") {
    return new TextEncoder().encode(data).buffer;
  }
  const typed = data as Uint8Array;
  const copy = new Uint8Array(typed.byteLength);
  copy.set(typed);
  return copy.buffer;
}

export async function validateWritebackForFile(
  file: LibraryFile,
  payload: WritebackPayload
): Promise<WritebackResult> {
  try {
    if (file.extension === "mp3") {
      await writeMp3Tags(file, payload);
      return { success: true, target: "file" };
    }
    if (FFMPEG_EXTENSIONS.has(file.extension)) {
      await writeWithFfmpeg(file, payload);
      return { success: true, target: "file" };
    }
    return {
      success: false,
      target: "file",
      error: `In-place writeback not supported for .${file.extension}.`,
    };
  } catch (error) {
    return {
      success: false,
      target: "file",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function writeInPlace(
  file: LibraryFile,
  payload: WritebackPayload
): Promise<WritebackResult> {
  if (!file.handle) {
    return {
      success: false,
      target: "file",
      error: "File handle not available for writeback.",
    };
  }

  if (file.extension === "mp3") {
    const updatedBuffer = await writeMp3Tags(file, payload);
    const writable = await file.handle.createWritable();
    await writable.write(updatedBuffer);
    await writable.close();
    return {
      success: true,
      target: "file",
    };
  }

  if (FFMPEG_EXTENSIONS.has(file.extension)) {
    const updatedBuffer = await writeWithFfmpeg(file, payload);
    const writable = await file.handle.createWritable();
    await writable.write(updatedBuffer);
    await writable.close();
    return {
      success: true,
      target: "file",
    };
  }

  {
    return {
      success: false,
      target: "file",
      error: `In-place writeback not supported for .${file.extension}.`,
    };
  }
}

export async function writeMetadataWithFallback(
  file: LibraryFile,
  payload: WritebackPayload,
  rootHandle: FileSystemDirectoryHandle
): Promise<WritebackResult> {
  try {
    const inPlaceResult = await writeInPlace(file, payload);
    if (inPlaceResult.success) {
      return inPlaceResult;
    }
    if (!inPlaceResult.error?.includes("not supported")) {
      logger.debug(
        "In-place writeback failed, falling back to sidecar",
        inPlaceResult.error
      );
    }
  } catch (error) {
    logger.warn("In-place writeback failed, falling back to sidecar", error);
  }

  try {
    await writeSidecarMetadata(rootHandle, {
      version: 1,
      trackFileId: file.trackFileId,
      relativePath: file.relativePath,
      tags: payload.tags,
      bpm: payload.bpm,
      tempoCategory: payload.tempoCategory,
      mood: payload.mood,
      updatedAt: Date.now(),
    });
    return {
      success: true,
      target: "sidecar",
    };
  } catch (error) {
    return {
      success: false,
      target: "sidecar",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


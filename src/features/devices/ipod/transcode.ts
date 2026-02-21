import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { logger } from "@/lib/logger";

type TranscodeProgress = { progress?: number; time?: number };

function getAssetBase(): string {
  if (typeof window === "undefined") return "http://localhost";
  const nextData = (window as any).__NEXT_DATA__;
  const prefix = typeof nextData?.assetPrefix === "string" ? nextData.assetPrefix : "";
  if (prefix.startsWith("http")) return prefix;
  return `${window.location.origin}${prefix}`;
}

const FFMPEG_CORE_VERSION = "0.12.9";
const CDN_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

async function verifyAsset(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;
  } catch {
    // fall through
  }
  try {
    const get = await fetch(url);
    return get.ok;
  } catch {
    return false;
  }
}

async function loadFfmpegInstance(ffmpeg: FFmpeg) {
  const base = getAssetBase();
  let coreURL = new URL("/ffmpeg/ffmpeg-core.js", base).toString();
  let wasmURL = new URL("/ffmpeg/ffmpeg-core.wasm", base).toString();

  const cdnCore = `${CDN_BASE}/ffmpeg-core.js`;
  const cdnWasm = `${CDN_BASE}/ffmpeg-core.wasm`;
  const localOk = (await verifyAsset(coreURL)) && (await verifyAsset(wasmURL));
  const cdnOk = (await verifyAsset(cdnCore)) && (await verifyAsset(cdnWasm));
  if (!localOk) {
    if (cdnOk) {
      logger.info("Using FFmpeg core from CDN (local assets not found)");
      coreURL = cdnCore;
      wasmURL = cdnWasm;
    } else {
      throw new Error(
        `Missing ffmpeg asset. Add files to public/ffmpeg/ or run: yarn add -D @ffmpeg/core@^0.12 && yarn copy-ffmpeg`
      );
    }
  }

  async function doLoad(core: string, wasm: string) {
    await ffmpeg.load({ coreURL: core, wasmURL: wasm });
  }

  try {
    await doLoad(coreURL, wasmURL);
  } catch (error) {
    if (
      (coreURL.startsWith("http://localhost") || coreURL.includes("/ffmpeg/")) &&
      (await verifyAsset(cdnCore)) &&
      (await verifyAsset(cdnWasm))
    ) {
      logger.info("FFmpeg local load failed, retrying with CDN", { error });
      try {
        await doLoad(cdnCore, cdnWasm);
      } catch (cdnError) {
        logger.warn("Failed to load ffmpeg core (single-thread)", cdnError);
        throw cdnError;
      }
    } else {
      logger.warn("Failed to load ffmpeg core (single-thread)", error);
      throw error;
    }
  }
  return ffmpeg;
}

function computeThreadsPerJob(concurrency: number) {
  const hc = Number(globalThis.navigator?.hardwareConcurrency || 0);
  if (!Number.isFinite(hc) || hc <= 0) return 0;
  const usable = Math.max(1, hc - 1);
  return Math.max(1, Math.floor(usable / Math.max(1, concurrency)));
}

function replaceExtension(name: string, newExtWithDot: string) {
  const base = String(name || "track").replace(/\.[^/.]+$/, "");
  return `${base}${newExtWithDot}`;
}

async function transcodeWithInstance(
  ffmpeg: FFmpeg,
  file: File,
  options?: { onProgress?: (progress: TranscodeProgress) => void; threads?: number }
) {
  const { onProgress, threads = 0 } = options ?? {};
  const logHandler = ({ type, message }: { type: string; message: string }) => {
    if (!message) return;
    // keep minimal; callers can add logging if needed
  };
  const progressHandler = ({ progress, time }: { progress: number; time: number }) => {
    try {
      onProgress?.({ progress, time });
    } catch {
      // ignore
    }
  };

  ffmpeg.on("log", logHandler);
  ffmpeg.on("progress", progressHandler);

  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputName = `input-${jobId}.flac`;
  const outputName = `output-${jobId}.m4a`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    const rc = await ffmpeg.exec([
      "-i",
      inputName,
      "-map",
      "0:a:0",
      "-vn",
      "-sn",
      "-dn",
      "-map_metadata",
      "0",
      "-c:a",
      "alac",
      "-threads",
      String(threads || 0),
      outputName,
    ]);
    if (rc !== 0) {
      throw new Error(`ffmpeg exited with code ${rc}`);
    }
    const data = await ffmpeg.readFile(outputName);
    const bytes =
      data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBufferLike);
    const safeBytes = new Uint8Array(bytes);
    return new File([safeBytes.buffer], replaceExtension(file.name, ".m4a"), {
      type: "audio/mp4",
    });
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // ignore
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // ignore
    }
    try {
      ffmpeg.off("log", logHandler);
    } catch {
      // ignore
    }
    try {
      ffmpeg.off("progress", progressHandler);
    } catch {
      // ignore
    }
  }
}

export function createTranscodePool(options?: { concurrency?: number }) {
  const concurrency = Math.max(1, Math.floor(options?.concurrency ?? 2));
  const slots = Array.from({ length: concurrency }, () => ({
    ffmpeg: null as FFmpeg | null,
    loading: null as Promise<void> | null,
    busy: false,
  }));

  async function getSlot(index: number) {
    const slot = slots[index];
    if (slot.ffmpeg && !slot.loading) {
      return slot;
    }
    slot.ffmpeg = new FFmpeg();
    slot.loading = loadFfmpegInstance(slot.ffmpeg).then(() => {
      slot.loading = null;
    }).catch((error) => {
      slot.loading = null;
      slot.ffmpeg = null;
      throw error;
    });
    await slot.loading;
    return slot;
  }

  async function acquire() {
    while (true) {
      for (let i = 0; i < slots.length; i += 1) {
        if (!slots[i].busy) {
          slots[i].busy = true;
          await getSlot(i);
          return {
            slot: slots[i],
            release: () => {
              slots[i].busy = false;
            },
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function init(): Promise<boolean> {
    try {
      await getSlot(0);
      return true;
    } catch (error) {
      logger.warn("FFmpeg initialization failed", error);
      return false;
    }
  }

  async function transcodeFlacToAlacM4a(
    file: File,
    options?: { onProgress?: (progress: TranscodeProgress) => void }
  ) {
    const { slot, release } = await acquire();
    const threads = computeThreadsPerJob(concurrency);
    try {
      return await transcodeWithInstance(slot.ffmpeg!, file, {
        onProgress: options?.onProgress,
        threads,
      });
    } finally {
      release();
    }
  }

  return {
    init,
    transcodeFlacToAlacM4a,
    concurrency,
  };
}

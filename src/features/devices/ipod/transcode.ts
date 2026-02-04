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

async function verifyAsset(url: string) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return;
  } catch {
    // fall through
  }
  const get = await fetch(url);
  if (!get.ok) {
    throw new Error(`Missing ffmpeg asset: ${url}`);
  }
}

async function loadFfmpegInstance(ffmpeg: FFmpeg) {
  const base = getAssetBase();
  const coreURL = new URL("/ffmpeg/ffmpeg-core.mjs", base).toString();
  const wasmURL = new URL("/ffmpeg/ffmpeg-core.wasm", base).toString();

  await Promise.all([verifyAsset(coreURL), verifyAsset(wasmURL)]);

  try {
    await ffmpeg.load({
      coreURL,
      wasmURL,
    });
  } catch (error) {
    logger.warn("Failed to load ffmpeg core (single-thread)", error);
    throw error;
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

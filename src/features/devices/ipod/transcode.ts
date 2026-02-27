import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { logger } from "@/lib/logger";
import {
  getFfmpegAssetUrls,
  getFfmpegCdnUrls,
  getFfmpegAssetBase,
} from "@/lib/ffmpeg-asset-urls";

type TranscodeProgress = { progress?: number; time?: number };

function isLocalhostOrigin(): boolean {
  if (typeof window === "undefined") return true;
  const base = getFfmpegAssetBase();
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(base);
}

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
  const { coreURL: cdnCore, wasmURL: cdnWasm } = getFfmpegCdnUrls();
  const cdnOk = (await verifyAsset(cdnCore)) && (await verifyAsset(cdnWasm));

  let coreURL: string;
  let wasmURL: string;

  if (isLocalhostOrigin()) {
    if (cdnOk) {
      logger.info("Using FFmpeg core from CDN (localhost: worker requires ESM from CDN)");
      coreURL = cdnCore;
      wasmURL = cdnWasm;
    } else {
      throw new Error(
        "FFmpeg CDN unreachable on localhost. Check network or use production build with public/ffmpeg/."
      );
    }
  } else {
    const { coreURL: localCore, wasmURL: localWasm } = getFfmpegAssetUrls();
    const localOk = (await verifyAsset(localCore)) && (await verifyAsset(localWasm));
    if (localOk) {
      coreURL = localCore;
      wasmURL = localWasm;
    } else if (cdnOk) {
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
      !isLocalhostOrigin() &&
      (coreURL.includes("/ffmpeg/") || coreURL.startsWith("http://localhost")) &&
      cdnOk
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

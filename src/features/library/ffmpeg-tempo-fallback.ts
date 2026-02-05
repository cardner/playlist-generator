/**
 * FFmpeg fallback for tempo detection
 *
 * When AudioContext.decodeAudioData fails with EncodingError, transcode the file
 * to WAV so tempo detection can proceed. Uses FFmpeg WASM.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_LOAD_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;
let lastLoadError: Error | null = null;
let loadAttempts = 0;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  // If we've exceeded max retries, throw the cached error
  if (lastLoadError && loadAttempts >= MAX_LOAD_RETRIES) {
    throw new Error(`FFmpeg load failed after ${MAX_LOAD_RETRIES} attempts: ${lastLoadError.message}`);
  }

  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      try {
        // Apply exponential backoff if this is a retry
        if (loadAttempts > 0) {
          const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, loadAttempts - 1);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        loadAttempts++;
        const instance = new FFmpeg();
        await instance.load();
        ffmpegInstance = instance;
        
        // Reset error state on success
        lastLoadError = null;
        loadAttempts = 0;
        
        return instance;
      } catch (error) {
        // Cache the error and clear loading promise to allow retry
        lastLoadError = error instanceof Error ? error : new Error(String(error));
        ffmpegLoading = null;
        throw lastLoadError;
      }
    })();
  }
  return ffmpegLoading;
}

export interface TranscodeToWavOptions {
  timeoutMs?: number;
  maxFileBytes?: number;
}

/**
 * Transcode an audio file to WAV for tempo detection.
 * Uses first 30 seconds, mono, 44.1kHz - sufficient for BPM analysis.
 *
 * @param file - Audio file to transcode
 * @param options - Optional timeout and file size limit
 * @returns Promise resolving to WAV File, or rejects on failure
 */
export async function transcodeToWavForTempo(
  file: File,
  options: TranscodeToWavOptions = {}
): Promise<File> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = options;

  if (file.size > maxFileBytes) {
    throw new Error(`File too large for tempo transcode (${file.size} > ${maxFileBytes} bytes)`);
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputName = `tempo-in-${jobId}.${ext}`;
  const outputName = `tempo-out-${jobId}.wav`;

  const transcode = async (): Promise<File> => {
    const ffmpeg = await getFFmpeg();

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      const rc = await ffmpeg.exec([
        "-i",
        inputName,
        "-f",
        "wav",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "1",
        "-t",
        "30",
        outputName,
      ]);

      if (rc !== 0) {
        throw new Error(`FFmpeg exited with code ${rc}`);
      }

      const data = await ffmpeg.readFile(outputName);
      const bytes =
        data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBufferLike);
      const safeBytes = new Uint8Array(bytes);

      return new File([safeBytes.buffer], "tempo-fallback.wav", {
        type: "audio/wav",
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
    }
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Transcode timeout")), timeoutMs);
  });

  return Promise.race([transcode(), timeoutPromise]);
}

/**
 * Check if FFmpeg is available for tempo fallback.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await getFFmpeg();
    return true;
  } catch {
    return false;
  }
}

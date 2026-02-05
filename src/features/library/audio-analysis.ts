/**
 * Audio Analysis Module
 * 
 * Provides tempo/BPM detection using Web Audio API and autocorrelation algorithm.
 * Analyzes audio files to detect beats per minute for enhanced metadata.
 * 
 * Features:
 * - Tempo detection using autocorrelation
 * - Web Audio API integration
 * - Runs analysis in chunks to avoid blocking
 * - Returns BPM value or null if detection fails
 * 
 * @module features/library/audio-analysis
 */

import { logger } from "@/lib/logger";
import { transcodeToWavForTempo } from "./ffmpeg-tempo-fallback";

/** After first "AudioContext not available in worker", skip worker-decode path for subsequent files. */
let workerDecodeUnavailable: boolean | null = null;

/** Cached result of probe: can worker use AudioContext? null = not yet probed. */
let workerDecodeCapability: boolean | null = null;

/** In-flight probe promise so concurrent callers share one probe. */
let probePromise: Promise<boolean> | null = null;

const AUDIO_CONTEXT_UNAVAILABLE_MSG = "AudioContext not available in worker";

/**
 * Shared AudioContext for decoding audio on the main thread.
 * Reusing a single AudioContext is more efficient than creating a new one for each file,
 * as AudioContext creation is expensive and browsers limit the number of concurrent contexts.
 * The context is automatically closed after 30 seconds of inactivity to prevent resource leaks.
 */
let sharedDecodeContext: AudioContext | null = null;

/** Timer to automatically close the shared context after inactivity */
let contextCloseTimer: ReturnType<typeof setTimeout> | null = null;

/** Inactivity timeout in milliseconds before closing the shared AudioContext */
const CONTEXT_IDLE_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Gets or creates a shared AudioContext for decoding audio on the main thread.
 * Automatically schedules the context to be closed after inactivity.
 * 
 * @returns Shared AudioContext instance
 */
function getSharedDecodeContext(): AudioContext {
  if (!sharedDecodeContext || sharedDecodeContext.state === "closed") {
    sharedDecodeContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  
  // Reset the idle timer - schedule context to close after inactivity
  if (contextCloseTimer) {
    clearTimeout(contextCloseTimer);
  }
  contextCloseTimer = setTimeout(() => {
    closeSharedDecodeContext();
  }, CONTEXT_IDLE_TIMEOUT_MS);
  
  return sharedDecodeContext;
}

/**
 * Closes the shared AudioContext if it exists and is not already closed.
 * This frees up resources and should be called when tempo detection is no longer needed.
 * The context will be recreated on the next call to getSharedDecodeContext() if needed.
 */
export function closeSharedDecodeContext(): void {
  if (contextCloseTimer) {
    clearTimeout(contextCloseTimer);
    contextCloseTimer = null;
  }
  
  if (sharedDecodeContext) {
    if (sharedDecodeContext.state !== "closed") {
      const contextToClose = sharedDecodeContext;
      sharedDecodeContext = null; // Clear reference before closing to avoid race condition
      contextToClose.close().catch((err) => {
        logger.warn("Failed to close shared AudioContext:", err);
      });
    } else {
      // Context is already closed, just clear the reference
      sharedDecodeContext = null;
    }
  }
}

/**
 * Probe once whether the tempo worker can use AudioContext. Caches result.
 * Concurrent callers share the same in-flight probe to avoid creating multiple workers.
 * Returns false on timeout or error.
 */
async function probeWorkerDecodeCapability(): Promise<boolean> {
  if (workerDecodeUnavailable === true) return false;
  if (workerDecodeCapability !== null) return workerDecodeCapability;
  if (probePromise) return probePromise;

  probePromise = (async (): Promise<boolean> => {
    try {
      const worker = new Worker("/tempo-worker-probe.js", { type: "classic" });
      const result = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          resolve(false);
        }, 3000);
        worker.onmessage = (e: MessageEvent<{ audioContextAvailable?: boolean }>) => {
          clearTimeout(timeout);
          worker.terminate();
          resolve(!!e.data?.audioContextAvailable);
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          resolve(false);
        };
        worker.postMessage({});
      });
      workerDecodeCapability = result;
      if (!result) workerDecodeUnavailable = true;
      return result;
    } catch {
      workerDecodeCapability = false;
      workerDecodeUnavailable = true;
      return false;
    } finally {
      probePromise = null;
    }
  })();

  return probePromise;
}

/**
 * Detect tempo (BPM) from an audio file
 * 
 * Uses Web Audio API to analyze the audio file and detect tempo using
 * an autocorrelation algorithm. This is a CPU-intensive operation that
 * should be run in a Web Worker for large files.
 * 
 * @param file - Audio file to analyze
 * @returns Promise resolving to BPM value or null if detection fails
 * 
 * @example
 * ```typescript
 * const bpm = await detectTempo(audioFile);
 * if (bpm) {
 *   console.log(`Detected tempo: ${bpm} BPM`);
 * }
 * ```
 */
export async function detectTempo(file: File): Promise<number | null> {
  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode audio file
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Get audio data (use first channel)
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    // Analyze tempo using autocorrelation
    const result = analyzeTempo(channelData, sampleRate);
    
    // Clean up
    audioContext.close();
    
    return result.bpm;
  } catch (error) {
    logger.error("Failed to detect tempo:", error);
    return null;
  }
}

/**
 * Detect tempo with confidence score
 * 
 * @param file - Audio file to analyze
 * @param method - Detection method to use (default: 'combined')
 * @returns Promise resolving to BPM value, confidence, and method
 */
export async function detectTempoWithConfidence(
  file: File,
  method: 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined' = 'combined'
): Promise<{ bpm: number | null; confidence: number; method: string }> {
  // Use worker for non-blocking detection
  return detectTempoInWorker(file, method);
}

/**
 * Analyze tempo using autocorrelation algorithm
 * 
 * This is a simplified tempo detection algorithm that:
 * 1. Calculates autocorrelation of the audio signal
 * 2. Finds peaks in the autocorrelation function
 * 3. Converts peak positions to BPM
 * 
 * @param channelData - Audio channel data (Float32Array)
 * @param sampleRate - Sample rate in Hz
 * @returns BPM value with confidence or null if detection fails
 */
function analyzeTempo(channelData: Float32Array, sampleRate: number): { bpm: number | null; confidence: number } {
  // Limit analysis to first 30 seconds to reduce computation
  const maxSamples = Math.min(channelData.length, sampleRate * 30);
  const samples = channelData.slice(0, maxSamples);
  
  // Downsample for faster processing (target ~8kHz)
  const downsampleFactor = Math.max(1, Math.floor(sampleRate / 8000));
  const downsampled: number[] = [];
  for (let i = 0; i < samples.length; i += downsampleFactor) {
    downsampled.push(samples[i]);
  }
  
  const downsampledRate = sampleRate / downsampleFactor;
  
  // Calculate autocorrelation
  const minPeriod = Math.floor(downsampledRate * 60 / 200); // 200 BPM max
  const maxPeriod = Math.floor(downsampledRate * 60 / 60);  // 60 BPM min
  const correlationLength = Math.min(downsampled.length, downsampledRate * 2); // 2 seconds max
  
  let maxCorrelation = 0;
  let bestPeriod = 0;
  
  // Autocorrelation for different periods
  for (let period = minPeriod; period <= maxPeriod && period < correlationLength; period++) {
    let correlation = 0;
    let count = 0;
    
    for (let i = 0; i < correlationLength - period; i++) {
      correlation += Math.abs(downsampled[i] * downsampled[i + period]);
      count++;
    }
    
    if (count > 0) {
      correlation /= count;
      
      // Normalize by period (shorter periods naturally have higher correlation)
      correlation /= Math.sqrt(period);
      
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }
  }
  
  // Find second-best correlation for confidence calculation
  let secondBestCorrelation = 0;
  for (let period = minPeriod; period <= maxPeriod && period < correlationLength; period++) {
    if (period === bestPeriod) continue;
    
    let correlation = 0;
    let count = 0;
    
    for (let i = 0; i < correlationLength - period; i++) {
      correlation += Math.abs(downsampled[i] * downsampled[i + period]);
      count++;
    }
    
    if (count > 0) {
      correlation /= count;
      correlation /= Math.sqrt(period);
      if (correlation > secondBestCorrelation) {
        secondBestCorrelation = correlation;
      }
    }
  }
  
  if (bestPeriod === 0 || maxCorrelation < 0.1) {
    // Detection failed - correlation too low
    return { bpm: null, confidence: 0 };
  }
  
  // Convert period to BPM
  const bpm = (downsampledRate * 60) / bestPeriod;
  
  // Round to nearest integer and validate range
  let roundedBpm = Math.round(bpm);
  if (roundedBpm < 60 || roundedBpm > 200) {
    // Out of typical range, might be a harmonic
    // Try doubling or halving
    const doubled = roundedBpm * 2;
    const halved = roundedBpm / 2;
    
    if (doubled >= 60 && doubled <= 200) {
      roundedBpm = doubled;
    } else if (halved >= 60 && halved <= 200) {
      roundedBpm = halved;
    } else {
      return { bpm: null, confidence: 0 };
    }
  }
  
  // Calculate confidence: ratio between best and second-best correlation
  const confidence = secondBestCorrelation > 0 
    ? Math.min(1, maxCorrelation / (maxCorrelation + secondBestCorrelation))
    : maxCorrelation;
  
  return {
    bpm: roundedBpm >= 60 && roundedBpm <= 200 ? roundedBpm : null,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

/**
 * When worker reports EncodingError, transcode to WAV and retry with worker.
 */
async function detectTempoWithFfmpegFallback(
  file: File,
  method: 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined'
): Promise<{ bpm: number | null; confidence: number; method: string }> {
  try {
    logger.debug("Tempo: using FFmpeg fallback for", file.name);
    const wavFile = await transcodeToWavForTempo(file);
    return detectTempoInWorker(wavFile, method);
  } catch (err) {
    logger.warn("FFmpeg tempo fallback failed:", err);
    return { bpm: null, confidence: 0, method };
  }
}

/**
 * Detect tempo in a Web Worker (for non-blocking analysis)
 * 
 * This function creates a Web Worker to run tempo detection without
 * blocking the main thread. Useful for large files or batch processing.
 * 
 * @param file - Audio file to analyze
 * @param method - Detection method to use (default: 'combined')
 * @returns Promise resolving to BPM value, confidence, and method used
 * 
 * @example
 * ```typescript
 * const result = await detectTempoInWorker(audioFile, 'combined');
 * if (result.bpm) {
 *   console.log(`Detected tempo: ${result.bpm} BPM (confidence: ${result.confidence})`);
 * }
 * ```
 */
export async function detectTempoInWorker(
  file: File,
  method: 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined' = 'combined'
): Promise<{ bpm: number | null; confidence: number; method: string }> {
  if (workerDecodeUnavailable === true) {
    return detectTempoWithMainThreadDecode(file, method);
  }

  const canDecodeInWorker = await probeWorkerDecodeCapability();
  if (!canDecodeInWorker) {
    return detectTempoWithMainThreadDecode(file, method);
  }

  let worker: Worker | null = null;

  try {
    worker = new Worker('/tempo-detection-worker.js', { type: 'classic' });
    logger.debug("Created tempo detection worker from public folder");

    // Post File to worker - worker decodes audio internally to keep main thread free
    return await new Promise<{ bpm: number | null; confidence: number; method: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          worker?.terminate();
          reject(new Error('Tempo detection timeout'));
        }, 30000);

        worker!.onmessage = (
          event: MessageEvent<{
            bpm: number | null;
            confidence: number;
            method: string;
            error?: string;
            encodingError?: boolean;
          }>
        ) => {
          clearTimeout(timeout);
          worker?.terminate();

          if (event.data.error) {
            if (event.data.error.includes(AUDIO_CONTEXT_UNAVAILABLE_MSG)) {
              workerDecodeUnavailable = true;
              detectTempoWithMainThreadDecode(file, method).then(resolve).catch(() => {
                resolve({ bpm: null, confidence: 0, method });
              });
              return;
            }
            if (event.data.encodingError) {
              detectTempoWithFfmpegFallback(file, method).then(resolve).catch(() => {
                resolve({ bpm: null, confidence: 0, method });
              });
              return;
            }
            reject(new Error(event.data.error));
            return;
          }
          resolve(event.data);
        };

        worker!.onerror = () => {
          clearTimeout(timeout);
          worker?.terminate();
          reject(new Error('Tempo detection worker error'));
        };

        worker!.postMessage({ file, method });
      }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes(AUDIO_CONTEXT_UNAVAILABLE_MSG)) {
      workerDecodeUnavailable = true;
    }
    logger.debug("Worker decode failed, falling back to main-thread decode", error);
    return detectTempoWithMainThreadDecode(file, method);
  }
}

/**
 * Fallback when worker cannot decode (e.g. AudioContext unavailable in worker).
 * Decodes on main thread, transfers channel data to worker for analysis.
 */
async function detectTempoWithMainThreadDecode(
  file: File,
  method: 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined'
): Promise<{ bpm: number | null; confidence: number; method: string }> {
  let arrayBuffer: ArrayBuffer | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let channelData: Float32Array | null = null;
  let sampleRate = 0;

  try {
    const audioContext = getSharedDecodeContext();
    arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    channelData = audioBuffer.getChannelData(0);
    sampleRate = audioBuffer.sampleRate;
    if (!channelData) {
      throw new Error("Failed to extract audio channel data");
    }
    const channelDataForWorker = channelData;

    let worker: Worker | null = null;
    try {
      worker = new Worker('/tempo-detection-worker.js', { type: 'classic' });
    } catch {
      const result = analyzeTempo(channelDataForWorker, sampleRate);
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        method: 'autocorrelation',
      };
    }

    return await new Promise<{ bpm: number | null; confidence: number; method: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          worker?.terminate();
          reject(new Error('Tempo detection timeout'));
        }, 30000);

        worker!.onmessage = (
          event: MessageEvent<{ bpm: number | null; confidence: number; method: string; error?: string }>
        ) => {
          clearTimeout(timeout);
          worker?.terminate();
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data);
          }
        };

        worker!.onerror = () => {
          clearTimeout(timeout);
          worker?.terminate();
          const result = analyzeTempo(channelDataForWorker, sampleRate);
          resolve({
            bpm: result.bpm,
            confidence: result.confidence,
            method: 'autocorrelation',
          });
        };

        worker!.postMessage(
          { channelData: channelDataForWorker, sampleRate, method },
          [channelDataForWorker.buffer]
        );
      }
    );
  } catch (error) {
    logger.error("Failed to detect tempo:", error);
    const bpm = await detectTempo(file);
    return {
      bpm,
      confidence: bpm ? 0.5 : 0,
      method: 'autocorrelation',
    };
  } finally {
    channelData = null;
    audioBuffer = null;
    arrayBuffer = null;
  }
}


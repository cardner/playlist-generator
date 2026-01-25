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
  let arrayBuffer: ArrayBuffer | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let channelData: Float32Array | null = null;
  let sampleRate = 0;

  try {
    // Decode audio in main thread (AudioContext not available in Worker)
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    channelData = audioBuffer.getChannelData(0);
    sampleRate = audioBuffer.sampleRate;
    if (!channelData) {
      throw new Error("Failed to extract audio channel data");
    }
    const channelDataForWorker = channelData;
    
    audioContext.close();
    
    // Create worker from public folder (works best for static builds)
    // For static webapps, workers must be in the public folder as JavaScript files
    let worker: Worker | null = null;
    
    try {
      // Load worker from public folder - this works reliably in static builds
      worker = new Worker('/tempo-detection-worker.js', { type: 'classic' });
      logger.debug("Created tempo detection worker from public folder");
    } catch (workerError) {
      // Worker creation failed, use main thread
      logger.debug("Worker not available, using main thread for tempo detection", workerError);
      const result = analyzeTempo(channelDataForWorker, sampleRate);
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        method: 'autocorrelation',
      };
    }
    
    if (!worker) {
      // Final fallback to main thread
      const result = analyzeTempo(channelData, sampleRate);
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        method: 'autocorrelation',
      };
    }
    
    // Send data to worker
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker?.terminate();
        reject(new Error('Tempo detection timeout'));
      }, 30000); // 30 second timeout
      
      worker!.onmessage = (event: MessageEvent<{ bpm: number | null; confidence: number; method: string; error?: string }>) => {
        clearTimeout(timeout);
        worker?.terminate();
        
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };
      
      worker!.onerror = (error) => {
        clearTimeout(timeout);
        worker?.terminate();
        // Fallback to main thread on worker error
        logger.debug("Worker error, falling back to main thread");
        const result = analyzeTempo(channelDataForWorker, sampleRate);
        resolve({
          bpm: result.bpm,
          confidence: result.confidence,
          method: 'autocorrelation',
        });
      };
      
      // Transfer channel data to worker (using transferable for performance)
      worker!.postMessage({
        channelData: channelDataForWorker,
        sampleRate,
        method,
      }, [channelDataForWorker.buffer]);
    });
  } catch (error) {
    logger.error("Failed to detect tempo in worker:", error);
    // Fallback to main thread detection
    const bpm = await detectTempo(file);
    return {
      bpm,
      confidence: bpm ? 0.5 : 0, // Lower confidence for fallback
      method: 'autocorrelation',
    };
  } finally {
    // Release references for GC under memory pressure
    channelData = null;
    audioBuffer = null;
    arrayBuffer = null;
  }
}


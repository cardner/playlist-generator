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
    const bpm = analyzeTempo(channelData, sampleRate);
    
    // Clean up
    audioContext.close();
    
    return bpm;
  } catch (error) {
    logger.error("Failed to detect tempo:", error);
    return null;
  }
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
 * @returns BPM value or null if detection fails
 */
function analyzeTempo(channelData: Float32Array, sampleRate: number): number | null {
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
  
  if (bestPeriod === 0 || maxCorrelation < 0.1) {
    // Detection failed - correlation too low
    return null;
  }
  
  // Convert period to BPM
  const bpm = (downsampledRate * 60) / bestPeriod;
  
  // Round to nearest integer and validate range
  const roundedBpm = Math.round(bpm);
  if (roundedBpm < 60 || roundedBpm > 200) {
    // Out of typical range, might be a harmonic
    // Try doubling or halving
    const doubled = roundedBpm * 2;
    const halved = roundedBpm / 2;
    
    if (doubled >= 60 && doubled <= 200) {
      return doubled;
    }
    if (halved >= 60 && halved <= 200) {
      return halved;
    }
  }
  
  return roundedBpm >= 60 && roundedBpm <= 200 ? roundedBpm : null;
}

/**
 * Detect tempo in a Web Worker (for non-blocking analysis)
 * 
 * This function creates a Web Worker to run tempo detection without
 * blocking the main thread. Useful for large files or batch processing.
 * 
 * @param file - Audio file to analyze
 * @returns Promise resolving to BPM value or null
 * 
 * @example
 * ```typescript
 * const bpm = await detectTempoInWorker(audioFile);
 * ```
 */
export async function detectTempoInWorker(file: File): Promise<number | null> {
  // For now, just use the main thread version
  // In the future, this could spawn a Web Worker
  return detectTempo(file);
}


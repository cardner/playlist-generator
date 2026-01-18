/**
 * Tempo Detection Web Worker
 * 
 * Runs tempo detection algorithms in a background thread to avoid blocking the UI.
 * Supports multiple detection methods: autocorrelation, spectral flux, peak picking, and combined.
 * 
 * @module workers/tempo-detection-worker
 */

// Worker message types
interface TempoDetectionRequest {
  channelData: Float32Array; // Pre-decoded audio channel data
  sampleRate: number;
  method: 'autocorrelation' | 'spectral-flux' | 'peak-picking' | 'combined';
}

interface TempoDetectionResponse {
  bpm: number | null;
  confidence: number; // 0-1
  method: string;
  error?: string;
}

// Handle messages from main thread
self.onmessage = (event: MessageEvent<TempoDetectionRequest>) => {
  const { channelData, sampleRate, method } = event.data;

  try {
    // Run detection based on method
    let result: { bpm: number | null; confidence: number };
    
    switch (method) {
      case 'autocorrelation':
        result = detectTempoAutocorrelation(channelData, sampleRate);
        break;
      case 'spectral-flux':
        result = detectTempoSpectralFlux(channelData, sampleRate);
        break;
      case 'peak-picking':
        result = detectTempoPeakPicking(channelData, sampleRate);
        break;
      case 'combined':
        result = detectTempoCombined(channelData, sampleRate);
        break;
      default:
        result = detectTempoAutocorrelation(channelData, sampleRate);
    }
    
    const response: TempoDetectionResponse = {
      bpm: result.bpm,
      confidence: result.confidence,
      method,
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: TempoDetectionResponse = {
      bpm: null,
      confidence: 0,
      method,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

/**
 * Detect tempo using autocorrelation algorithm
 */
function detectTempoAutocorrelation(
  channelData: Float32Array,
  sampleRate: number
): { bpm: number | null; confidence: number } {
  // Limit analysis to first 30 seconds
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
  
  const correlations: Array<{ period: number; value: number }> = [];
  
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
      correlations.push({ period, value: correlation });
    }
  }
  
  if (correlations.length === 0) {
    return { bpm: null, confidence: 0 };
  }
  
  // Sort by correlation value
  correlations.sort((a, b) => b.value - a.value);
  
  const best = correlations[0];
  const secondBest = correlations.length > 1 ? correlations[1] : { value: 0 };
  
  if (best.value < 0.1) {
    return { bpm: null, confidence: 0 };
  }
  
  // Convert period to BPM
  let bpm = (downsampledRate * 60) / best.period;
  
  // Round to nearest integer and validate range
  let roundedBpm = Math.round(bpm);
  if (roundedBpm < 60 || roundedBpm > 200) {
    // Out of typical range, might be a harmonic
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
  const confidence = secondBest.value > 0 
    ? Math.min(1, best.value / (best.value + secondBest.value))
    : best.value;
  
  return {
    bpm: roundedBpm >= 60 && roundedBpm <= 200 ? roundedBpm : null,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

/**
 * Detect tempo using spectral flux (FFT-based)
 */
function detectTempoSpectralFlux(
  channelData: Float32Array,
  sampleRate: number
): { bpm: number | null; confidence: number } {
  // Limit analysis to first 30 seconds
  const maxSamples = Math.min(channelData.length, sampleRate * 30);
  const samples = channelData.slice(0, maxSamples);
  
  // Apply high-pass filter (40-200 Hz for kick/bass)
  const filtered = applyHighPassFilter(samples, sampleRate, 40);
  
  // Calculate spectral flux
  const windowSize = 2048;
  const hopSize = 512;
  const fluxValues: number[] = [];
  
  for (let i = 0; i < filtered.length - windowSize; i += hopSize) {
    const window = filtered.slice(i, i + windowSize);
    const flux = calculateSpectralFlux(window, sampleRate);
    fluxValues.push(flux);
  }
  
  if (fluxValues.length < 10) {
    return { bpm: null, confidence: 0 };
  }
  
  // Find peaks in flux signal
  const peaks = findPeaks(fluxValues);
  
  if (peaks.length < 2) {
    return { bpm: null, confidence: 0 };
  }
  
  // Calculate inter-peak intervals
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  // Build histogram of intervals
  const histogram = new Map<number, number>();
  for (const interval of intervals) {
    const rounded = Math.round(interval);
    histogram.set(rounded, (histogram.get(rounded) || 0) + 1);
  }
  
  // Find most common interval
  let maxCount = 0;
  let bestInterval = 0;
  for (const [interval, count] of histogram.entries()) {
    if (count > maxCount) {
      maxCount = count;
      bestInterval = interval;
    }
  }
  
  if (bestInterval === 0) {
    return { bpm: null, confidence: 0 };
  }
  
  // Convert interval to BPM
  // Interval is in hop samples, convert to seconds then BPM
  const intervalSeconds = (bestInterval * hopSize) / sampleRate;
  const bpm = 60 / intervalSeconds;
  
  const roundedBpm = Math.round(bpm);
  if (roundedBpm < 60 || roundedBpm > 200) {
    return { bpm: null, confidence: 0 };
  }
  
  // Calculate confidence based on histogram peak clarity
  const totalIntervals = intervals.length;
  const confidence = maxCount / totalIntervals;
  
  return {
    bpm: roundedBpm,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

/**
 * Detect tempo using peak picking + IOI histogram
 */
function detectTempoPeakPicking(
  channelData: Float32Array,
  sampleRate: number
): { bpm: number | null; confidence: number } {
  // Limit analysis to first 30 seconds
  const maxSamples = Math.min(channelData.length, sampleRate * 30);
  const samples = channelData.slice(0, maxSamples);
  
  // Apply high-pass filter for kick detection
  const filtered = applyHighPassFilter(samples, sampleRate, 40);
  
  // Detect onset peaks
  const peaks = detectOnsetPeaks(filtered, sampleRate);
  
  if (peaks.length < 2) {
    return { bpm: null, confidence: 0 };
  }
  
  // Calculate inter-onset intervals (IOI) in samples
  const iois: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    iois.push(peaks[i] - peaks[i - 1]);
  }
  
  // Build histogram of IOI values
  const histogram = new Map<number, number>();
  for (const ioi of iois) {
    // Round to nearest 10ms for histogram bins
    const bin = Math.round(ioi / (sampleRate * 0.01)) * (sampleRate * 0.01);
    histogram.set(bin, (histogram.get(bin) || 0) + 1);
  }
  
  // Find most common IOI
  let maxCount = 0;
  let bestIoi = 0;
  for (const [ioi, count] of histogram.entries()) {
    if (count > maxCount) {
      maxCount = count;
      bestIoi = ioi;
    }
  }
  
  if (bestIoi === 0) {
    return { bpm: null, confidence: 0 };
  }
  
  // Convert IOI to BPM
  const ioiSeconds = bestIoi / sampleRate;
  const bpm = 60 / ioiSeconds;
  
  let roundedBpm = Math.round(bpm);
  
  // Handle harmonics (double or half)
  if (roundedBpm < 60) {
    roundedBpm = roundedBpm * 2;
  } else if (roundedBpm > 200) {
    roundedBpm = Math.round(roundedBpm / 2);
  }
  
  if (roundedBpm < 60 || roundedBpm > 200) {
    return { bpm: null, confidence: 0 };
  }
  
  // Calculate confidence based on histogram peak clarity
  const totalIois = iois.length;
  const confidence = maxCount / totalIois;
  
  return {
    bpm: roundedBpm,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

/**
 * Combined method: runs multiple algorithms and returns consensus
 */
function detectTempoCombined(
  channelData: Float32Array,
  sampleRate: number
): { bpm: number | null; confidence: number } {
  const results = [
    detectTempoAutocorrelation(channelData, sampleRate),
    detectTempoSpectralFlux(channelData, sampleRate),
    detectTempoPeakPicking(channelData, sampleRate),
  ];
  
  // Filter out null results
    const validResults = results.filter(r => r.bpm !== null && r.confidence > 0);
  
    if (validResults.length === 0) {
      const best = results.reduce(
        (acc, cur) => {
          if (cur.bpm !== null && cur.confidence > acc.confidence) {
            return cur;
          }
          return acc;
        },
        { bpm: null, confidence: 0 }
      );
      return best.bpm !== null ? best : { bpm: null, confidence: 0 };
    }
  
  // Group results by BPM (within ±2 BPM tolerance)
  const groups = new Map<number, Array<{ bpm: number; confidence: number }>>();
  
  for (const result of validResults) {
    const bpm = result.bpm!; // Already filtered to non-null
    let foundGroup = false;
    
    for (const [groupBpm] of groups.entries()) {
      if (Math.abs(bpm - groupBpm) <= 2) {
        groups.get(groupBpm)!.push({ bpm, confidence: result.confidence });
        foundGroup = true;
        break;
      }
    }
    
    if (!foundGroup) {
      groups.set(bpm, [{ bpm, confidence: result.confidence }]);
    }
  }
  
  // Find group with highest total confidence
  let bestGroup: Array<{ bpm: number; confidence: number }> | null = null;
  let bestTotalConfidence = 0;
  
  for (const group of groups.values()) {
    const totalConfidence = group.reduce((sum, r) => sum + r.confidence, 0);
    if (totalConfidence > bestTotalConfidence) {
      bestTotalConfidence = totalConfidence;
      bestGroup = group;
    }
  }
  
  if (!bestGroup || bestGroup.length === 0) {
    return { bpm: null, confidence: 0 };
  }
  
  // Calculate weighted average BPM
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const result of bestGroup) {
    weightedSum += result.bpm * result.confidence;
    totalWeight += result.confidence;
  }
  
  const avgBpm = Math.round(weightedSum / totalWeight);
  
  // Combined confidence: average of individual confidences, boosted by agreement
  const avgConfidence = bestGroup.reduce((sum, r) => sum + r.confidence, 0) / bestGroup.length;
  const agreementBoost = bestGroup.length / results.length; // More methods agreeing = higher confidence
  const combinedConfidence = Math.min(1, avgConfidence * (1 + agreementBoost * 0.2));
  
  return {
    bpm: avgBpm >= 60 && avgBpm <= 200 ? avgBpm : null,
    confidence: combinedConfidence,
  };
}

/**
 * Apply high-pass filter to isolate low frequencies (kick/bass)
 */
function applyHighPassFilter(
  samples: Float32Array,
  sampleRate: number,
  cutoffHz: number
): Float32Array {
  // Simple high-pass filter using difference equation
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  
  const filtered = new Float32Array(samples.length);
  filtered[0] = samples[0];
  
  for (let i = 1; i < samples.length; i++) {
    filtered[i] = alpha * (filtered[i - 1] + samples[i] - samples[i - 1]);
  }
  
  return filtered;
}

/**
 * Calculate spectral flux for a window of audio
 */
function calculateSpectralFlux(window: Float32Array, sampleRate: number): number {
  // Simple magnitude-based flux calculation
  // In a full implementation, this would use FFT
  let flux = 0;
  let prevMagnitude = 0;
  
  for (let i = 0; i < window.length; i++) {
    const magnitude = Math.abs(window[i]);
    const diff = magnitude - prevMagnitude;
    if (diff > 0) {
      flux += diff;
    }
    prevMagnitude = magnitude;
  }
  
  return flux / window.length;
}

/**
 * Find peaks in a signal
 */
function findPeaks(signal: number[], minHeight: number = 0.1): number[] {
  const peaks: number[] = [];
  const threshold = Math.max(...signal) * minHeight;
  
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > threshold && signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      peaks.push(i);
    }
  }
  
  return peaks;
}

/**
 * Detect onset peaks in audio signal
 */
function detectOnsetPeaks(samples: Float32Array, sampleRate: number): number[] {
  const peaks: number[] = [];
  const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
  const threshold = 0.1;
  
  for (let i = windowSize; i < samples.length - windowSize; i += windowSize) {
    const window = samples.slice(i - windowSize, i + windowSize);
    const energy = window.reduce((sum, s) => sum + Math.abs(s), 0) / window.length;
    
    if (energy > threshold) {
      // Find peak within window
      let maxIdx = i;
      let maxVal = Math.abs(samples[i]);
      
      for (let j = i - windowSize; j < i + windowSize && j < samples.length; j++) {
        if (Math.abs(samples[j]) > maxVal) {
          maxVal = Math.abs(samples[j]);
          maxIdx = j;
        }
      }
      
      // Avoid duplicate peaks
      if (peaks.length === 0 || maxIdx - peaks[peaks.length - 1] > sampleRate * 0.1) {
        peaks.push(maxIdx);
      }
    }
  }
  
  return peaks;
}


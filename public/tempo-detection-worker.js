/**
 * Tempo Detection Web Worker
 *
 * Runs tempo detection algorithms in a background thread to avoid blocking the UI.
 * Supports multiple detection methods: autocorrelation, spectral flux, peak picking, and combined.
 * When a File is provided, decodes audio in the worker to keep main thread free.
 */

async function getChannelDataAndSampleRate(data) {
  if (data.file) {
    const arrayBuffer = await data.file.arrayBuffer();
    const AudioContextClass = self.AudioContext || self.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("AudioContext not available in worker");
    }
    const audioContext = new AudioContextClass();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      if (audioContext.close) {
        audioContext.close();
      }
      return { channelData, sampleRate };
    } catch (decodeError) {
      // Clean up AudioContext before re-throwing
      if (audioContext.close) {
        audioContext.close();
      }
      // Distinguish between encoding errors and other decode failures
      if (decodeError.name === "EncodingError") {
        throw new Error("Unable to decode audio data");
      }
      // Re-throw other errors as-is
      throw decodeError;
    }
  }
  return {
    channelData: data.channelData,
    sampleRate: data.sampleRate,
  };
}

// Handle messages from main thread
self.onmessage = async (event) => {
  const { method } = event.data;

  try {
    const { channelData, sampleRate } = await getChannelDataAndSampleRate(event.data);

    // Run detection based on method
    let result;
    
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
    
    self.postMessage({
      bpm: result.bpm,
      confidence: result.confidence,
      method,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const encodingError =
      (error && error.name === "EncodingError") ||
      (typeof errMsg === "string" &&
        (errMsg.includes("EncodingError") || errMsg.includes("Unable to decode")));
    self.postMessage({
      bpm: null,
      confidence: 0,
      method,
      error: errMsg,
      encodingError: encodingError || undefined,
    });
  }
};

/**
 * Detect tempo using autocorrelation algorithm
 */
function detectTempoAutocorrelation(channelData, sampleRate) {
  // Limit analysis to first 30 seconds
  const maxSamples = Math.min(channelData.length, sampleRate * 30);
  const samples = channelData.slice(0, maxSamples);
  
  // Downsample for faster processing (target ~8kHz)
  const downsampleFactor = Math.max(1, Math.floor(sampleRate / 8000));
  const downsampled = [];
  for (let i = 0; i < samples.length; i += downsampleFactor) {
    downsampled.push(samples[i]);
  }
  
  const downsampledRate = sampleRate / downsampleFactor;
  
  // Calculate autocorrelation
  const minPeriod = Math.floor(downsampledRate * 60 / 200); // 200 BPM max
  const maxPeriod = Math.floor(downsampledRate * 60 / 60);  // 60 BPM min
  const correlationLength = Math.min(downsampled.length, downsampledRate * 2); // 2 seconds max
  
  const correlations = [];
  
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
function detectTempoSpectralFlux(channelData, sampleRate) {
  // Limit analysis to first 30 seconds
  const maxSamples = Math.min(channelData.length, sampleRate * 30);
  const samples = channelData.slice(0, maxSamples);
  
  // Apply high-pass filter (40-200 Hz for kick/bass)
  const filtered = applyHighPassFilter(samples, sampleRate, 40);
  
  // Calculate spectral flux
  const windowSize = 2048;
  const hopSize = 512;
  const fluxValues = [];
  
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
  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  // Build histogram of intervals
  const histogram = new Map();
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
function detectTempoPeakPicking(channelData, sampleRate) {
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
  const iois = [];
  for (let i = 1; i < peaks.length; i++) {
    iois.push(peaks[i] - peaks[i - 1]);
  }
  
  // Build histogram of IOI values
  const histogram = new Map();
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
function detectTempoCombined(channelData, sampleRate) {
  const autocorr = detectTempoAutocorrelation(channelData, sampleRate);
  const flux = detectTempoSpectralFlux(channelData, sampleRate);
  const peak = detectTempoPeakPicking(channelData, sampleRate);
  const results = [autocorr, flux, peak];
  
  // Filter out null results
  const validResults = results.filter(r => r.bpm !== null && r.confidence > 0);
  
  if (validResults.length === 0) {
    // Fallback: pick the best (even if low confidence) to avoid returning null
    const best = results.reduce((acc, cur) => {
      if (cur.bpm !== null && cur.confidence > acc.confidence) {
        return cur;
      }
      return acc;
    }, { bpm: null, confidence: 0 });
    return best.bpm !== null ? best : { bpm: null, confidence: 0 };
  }
  
  // Group results by BPM (within ±2 BPM tolerance)
  const groups = new Map();
  
  for (const result of validResults) {
    const bpm = result.bpm;
    let foundGroup = false;
    
    for (const [groupBpm] of groups.entries()) {
      if (Math.abs(bpm - groupBpm) <= 2) {
        groups.get(groupBpm).push({ bpm, confidence: result.confidence });
        foundGroup = true;
        break;
      }
    }
    
    if (!foundGroup) {
      groups.set(bpm, [{ bpm, confidence: result.confidence }]);
    }
  }
  
  // Find group with highest total confidence
  let bestGroup = null;
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
function applyHighPassFilter(samples, sampleRate, cutoffHz) {
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
function calculateSpectralFlux(window, sampleRate) {
  // Simple magnitude-based flux calculation
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
function findPeaks(signal, minHeight = 0.1) {
  const peaks = [];
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
function detectOnsetPeaks(samples, sampleRate) {
  const peaks = [];
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


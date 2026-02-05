/**
 * Minimal probe worker to check if AudioContext is available in workers.
 * Used to avoid creating tempo workers that will fail on first decode.
 */
self.onmessage = () => {
  const available = !!(self.AudioContext || self.webkitAudioContext);
  self.postMessage({ audioContextAvailable: available });
};

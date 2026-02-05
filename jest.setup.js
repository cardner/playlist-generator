// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock @ffmpeg/ffmpeg - FFmpeg WASM does not run in Jest (browser-only)
jest.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: jest.fn().mockImplementation(function () {
    this.loaded = false
    this.load = jest.fn().mockImplementation(() => {
      this.loaded = true
      return new Promise((resolve) => setTimeout(resolve, 50))
    })
    this.writeFile = jest.fn().mockResolvedValue(undefined)
    this.exec = jest.fn().mockResolvedValue(0)
    this.readFile = jest.fn().mockResolvedValue(new Uint8Array(100))
    this.deleteFile = jest.fn().mockResolvedValue(undefined)
    return this
  }),
}))

jest.mock('@ffmpeg/util', () => ({
  fetchFile: jest.fn().mockResolvedValue(new Uint8Array(10)),
}))

// Polyfill Blob.arrayBuffer - jsdom does not implement it
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = () => reject(fr.error)
      fr.readAsArrayBuffer(this)
    })
  }
}

// Mock AudioContext - jsdom does not provide it; needed for main-thread decode path
class MockAudioContext {
  get state() { return 'running' }
  decodeAudioData(arrayBuffer) {
    const sampleRate = 44100
    const length = Math.min(arrayBuffer.byteLength * 4, sampleRate * 30)
    const channelData = new Float32Array(length)
    return Promise.resolve({
      getChannelData: () => channelData,
      sampleRate,
      length,
      duration: length / sampleRate,
      numberOfChannels: 1,
    })
  }
  close() { return Promise.resolve() }
}
globalThis.AudioContext = MockAudioContext
globalThis.webkitAudioContext = MockAudioContext

// Mock Worker - real Worker hangs in jsdom loading scripts
let workerMockResponses = [{ error: 'EncodingError', encodingError: true, bpm: null, confidence: 0, method: 'combined' }]
let probeMockResponse = true // audioContextAvailable
globalThis.__setWorkerMockResponses = (responses) => { workerMockResponses = Array.isArray(responses) ? [...responses] : [responses] }
globalThis.__setProbeMockResponse = (v) => { probeMockResponse = v }
globalThis.Worker = class MockWorker {
  constructor(url) {
    const isProbe = typeof url === 'string' && url.includes('probe')
    const data = isProbe
      ? { audioContextAvailable: probeMockResponse }
      : (workerMockResponses.shift() ?? { bpm: null, confidence: 0, method: 'combined' })
    queueMicrotask(() => {
      if (this._onmessage) this._onmessage({ data })
    })
  }
  postMessage() {}
  terminate() {}
  _onmessage = null
  set onmessage(h) { this._onmessage = h }
  get onmessage() { return this._onmessage }
}


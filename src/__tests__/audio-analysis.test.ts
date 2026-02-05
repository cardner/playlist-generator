/**
 * Tests for audio analysis (tempo detection)
 *
 * When the tempo worker reports encodingError, the main thread uses the FFmpeg
 * fallback (transcodeToWavForTempo) and retries. Worker is mocked in jest.setup.js.
 *
 * Tests use a large file to trigger transcode rejection (file size limit), and
 * rely on the FFmpeg mock in jest.setup for the success path.
 *
 * Option 1: Cache worker decode failure - subsequent calls skip worker-decode path.
 * Option 2: Probe returns false - goes straight to main-thread decode.
 * Option 4: Shared AudioContext - main-thread decode reuses context (implied by passing tests).
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

import { detectTempoInWorker } from "@/features/library/audio-analysis";

declare global {
  var __setWorkerMockResponses: (responses: object | object[]) => void;
  var __setProbeMockResponse: (v: boolean) => void;
}

describe("detectTempoInWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.__setProbeMockResponse(true);
    globalThis.__setWorkerMockResponses([
      {
        error: "EncodingError: Unable to decode audio data",
        encodingError: true,
        bpm: null,
        confidence: 0,
        method: "combined",
      },
    ]);
  });

  it("should return error result when worker reports encodingError and transcode fails (file too large)", async () => {
    const largeFile = new File([new ArrayBuffer(1)], "test.m4a");
    Object.defineProperty(largeFile, "size", { value: 60 * 1024 * 1024 });

    const result = await detectTempoInWorker(largeFile, "combined");

    expect(result.bpm).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.method).toBe("combined");
  });

  it("should retry with WAV when worker reports encodingError and transcode succeeds", async () => {
    globalThis.__setWorkerMockResponses([
      {
        error: "EncodingError: Unable to decode audio data",
        encodingError: true,
        bpm: null,
        confidence: 0,
        method: "combined",
      },
      {
        bpm: 120,
        confidence: 0.85,
        method: "combined",
      },
    ]);

    const file = new File(["x"], "test.m4a");
    const result = await detectTempoInWorker(file, "combined");

    expect(result.bpm).toBe(120);
    expect(result.confidence).toBe(0.85);
    expect(result.method).toBe("combined");
  });

  it("should cache AudioContext-unavailable and skip worker-decode for subsequent calls (Option 1)", async () => {
    globalThis.__setWorkerMockResponses([
      { error: "AudioContext not available in worker", bpm: null, confidence: 0, method: "combined" },
      { bpm: 95, confidence: 0.8, method: "combined" },
      { bpm: 96, confidence: 0.75, method: "combined" },
    ]);

    const file = new File([new ArrayBuffer(100)], "test.m4a");
    const result1 = await detectTempoInWorker(file, "combined");
    const result2 = await detectTempoInWorker(file, "combined");

    expect(result1.bpm).toBe(95);
    expect(result2.bpm).toBe(96);
  });

  it("should go straight to main-thread decode when probe returns false (Option 2)", async () => {
    globalThis.__setProbeMockResponse(false);
    globalThis.__setWorkerMockResponses([{ bpm: 88, confidence: 0.7, method: "combined" }]);

    const file = new File([new ArrayBuffer(100)], "test.m4a");
    const result = await detectTempoInWorker(file, "combined");

    expect(result.bpm).toBe(88);
    expect(result.confidence).toBe(0.7);
  });
});

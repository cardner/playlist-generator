/**
 * Tests for FFmpeg tempo fallback
 *
 * FFmpeg is mocked globally in jest.setup.js (WASM does not run in Jest).
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  transcodeToWavForTempo,
  isFfmpegAvailable,
} from "@/features/library/ffmpeg-tempo-fallback";

describe("transcodeToWavForTempo", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("should reject when file exceeds maxFileBytes", async () => {
    const largeFile = new File([new ArrayBuffer(1)], "test.mp3");
    Object.defineProperty(largeFile, "size", { value: 60 * 1024 * 1024 });

    await expect(
      transcodeToWavForTempo(largeFile, { maxFileBytes: 50 * 1024 * 1024 })
    ).rejects.toThrow("File too large");
  });

  it("should reject with timeout when transcode exceeds timeoutMs", async () => {
    const smallFile = new File([new ArrayBuffer(100)], "test.mp3");
    Object.defineProperty(smallFile, "size", { value: 1024 });

    await expect(
      transcodeToWavForTempo(smallFile, { timeoutMs: 1 })
    ).rejects.toThrow("Transcode timeout");
  });

  it("should not reject with 'File too large' when file is within limit", async () => {
    const smallFile = new File([new ArrayBuffer(100)], "test.mp3");
    Object.defineProperty(smallFile, "size", { value: 1024 });

    try {
      await transcodeToWavForTempo(smallFile, { maxFileBytes: 50 * 1024 * 1024 });
    } catch (e) {
      expect((e as Error).message).not.toContain("File too large");
    }
  });
});

describe("isFfmpegAvailable", () => {
  it("should return a boolean", async () => {
    const result = await isFfmpegAvailable();
    expect(typeof result).toBe("boolean");
  });
});

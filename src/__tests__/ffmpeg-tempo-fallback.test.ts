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

describe("FFmpeg error handling and retries", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    // Reset module state between tests
    jest.resetModules();
  });

  it("should cache load errors and throw after max retries", async () => {
    // Mock FFmpeg to always fail
    const mockFFmpeg = {
      load: jest.fn().mockRejectedValue(new Error("Load failed")),
      loaded: false,
    };
    
    jest.doMock("@ffmpeg/ffmpeg", () => ({
      FFmpeg: jest.fn(() => mockFFmpeg),
    }));

    const { transcodeToWavForTempo } = await import("@/features/library/ffmpeg-tempo-fallback");
    const testFile = new File([new ArrayBuffer(100)], "test.mp3");
    Object.defineProperty(testFile, "size", { value: 1024 });

    // First 3 attempts should fail with the original error
    for (let i = 0; i < 3; i++) {
      await expect(transcodeToWavForTempo(testFile)).rejects.toThrow("Load failed");
    }

    // 4th attempt should throw the cached error message
    await expect(transcodeToWavForTempo(testFile)).rejects.toThrow(
      "FFmpeg load failed after 3 attempts"
    );

    // Verify load was called exactly 3 times (not 4)
    expect(mockFFmpeg.load).toHaveBeenCalledTimes(3);
  });

  it("should reset error state on successful load after previous failures", async () => {
    let callCount = 0;
    const mockFFmpeg = {
      load: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error("Temporary failure"));
        }
        mockFFmpeg.loaded = true;
        return Promise.resolve();
      }),
      loaded: false,
      writeFile: jest.fn().mockResolvedValue(undefined),
      exec: jest.fn().mockResolvedValue(0),
      readFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    jest.doMock("@ffmpeg/ffmpeg", () => ({
      FFmpeg: jest.fn(() => mockFFmpeg),
    }));
    jest.doMock("@ffmpeg/util", () => ({
      fetchFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    }));

    const { transcodeToWavForTempo } = await import("@/features/library/ffmpeg-tempo-fallback");
    const testFile = new File([new ArrayBuffer(100)], "test.mp3");
    Object.defineProperty(testFile, "size", { value: 1024 });

    // First two attempts should fail
    await expect(transcodeToWavForTempo(testFile)).rejects.toThrow("Temporary failure");
    await expect(transcodeToWavForTempo(testFile)).rejects.toThrow("Temporary failure");

    // Third attempt should succeed
    await expect(transcodeToWavForTempo(testFile)).resolves.toBeDefined();

    // Verify load was called 3 times
    expect(mockFFmpeg.load).toHaveBeenCalledTimes(3);
  });
});

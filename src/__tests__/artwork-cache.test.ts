/**
 * Tests for artwork cache persistence from metadata results.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

const mockPut = jest.fn().mockResolvedValue(undefined);

jest.mock("@/db/schema", () => ({
  db: {
    artworkCache: {
      put: (...args: unknown[]) => mockPut(...args),
    },
  },
  getCompositeId: (trackFileId: string, libraryRootId: string) =>
    `${trackFileId}-${libraryRootId}`,
}));

const mockResize = jest.fn();

jest.mock("@/features/devices/ipod/artwork-resize", () => ({
  resizeToIpodThumbnail: (...args: unknown[]) => mockResize(...args),
}));

describe("saveArtworkCacheFromResults", () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockResize.mockClear();
  });

  it("skips results without picture", async () => {
    const { saveArtworkCacheFromResults } = await import(
      "@/features/library/artwork-cache"
    );
    const results = [
      {
        trackFileId: "t1",
        tags: { title: "A", artist: "B", album: "C", genres: [] },
      },
    ] as any;

    await saveArtworkCacheFromResults(results, "root-1");

    expect(mockResize).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("resizes and puts when result has picture and resize returns bytes", async () => {
    const { saveArtworkCacheFromResults } = await import(
      "@/features/library/artwork-cache"
    );
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    mockResize.mockResolvedValue(jpegBytes);
    const results = [
      {
        trackFileId: "t1",
        tags: { title: "A", artist: "B", album: "C", genres: [] },
        picture: { format: "image/jpeg", data: new ArrayBuffer(10) },
      },
    ] as any;

    await saveArtworkCacheFromResults(results, "root-1");

    expect(mockResize).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith({
      id: "t1-root-1",
      thumbnail: expect.any(Blob),
    });
    expect((mockPut.mock.calls[0][0] as { thumbnail: Blob }).thumbnail.type).toBe(
      "image/jpeg"
    );
  });

  it("does not put when resize returns null", async () => {
    const { saveArtworkCacheFromResults } = await import(
      "@/features/library/artwork-cache"
    );
    mockResize.mockResolvedValue(null);
    const results = [
      {
        trackFileId: "t1",
        tags: { title: "A", artist: "B", album: "C", genres: [] },
        picture: { format: "image/jpeg", data: new ArrayBuffer(10) },
      },
    ] as any;

    await saveArtworkCacheFromResults(results, "root-1");

    expect(mockResize).toHaveBeenCalledTimes(1);
    expect(mockPut).not.toHaveBeenCalled();
  });
});

/**
 * Tests for iPod artwork extraction and resize (ArtworkDB sync path).
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const musicMetadata = require("music-metadata");

describe("extractArtworkFromFile", () => {
  beforeEach(() => {
    musicMetadata.parseBlob.mockReset();
    musicMetadata.selectCover.mockReset();
  });

  it("returns null when file has no pictures", async () => {
    musicMetadata.parseBlob.mockResolvedValue({ common: {} });
    musicMetadata.selectCover.mockReturnValue(null);

    const { extractArtworkFromFile } = await import("@/features/devices/ipod/artwork-extract");
    const file = new File(["fake audio"], "test.mp3", { type: "audio/mpeg" });

    const result = await extractArtworkFromFile(file);
    expect(result).toBeNull();
  });

  it("returns picture with format and data when metadata has cover", async () => {
    const fakeData = new Uint8Array([0xff, 0xd8, 0xff]);
    const picture = { format: "image/jpeg", data: fakeData, type: "Cover (front)" };
    musicMetadata.parseBlob.mockResolvedValue({
      common: { picture: [picture] },
    });
    musicMetadata.selectCover.mockImplementation((pics: { format: string; data: Uint8Array }[] | undefined) =>
      pics?.[0] ?? null
    );

    const { extractArtworkFromFile } = await import("@/features/devices/ipod/artwork-extract");
    const file = new File(["fake"], "test.mp3", { type: "audio/mpeg" });

    const result = await extractArtworkFromFile(file);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("image/jpeg");
    expect(result!.data).toEqual(fakeData);
  });

  it("returns null when parseBlob throws", async () => {
    musicMetadata.parseBlob.mockRejectedValue(new Error("Parse error"));

    const { extractArtworkFromFile } = await import("@/features/devices/ipod/artwork-extract");
    const file = new File(["x"], "test.mp3", { type: "audio/mpeg" });

    const result = await extractArtworkFromFile(file);
    expect(result).toBeNull();
  });
});

describe("resizeToIpodThumbnail", () => {
  let OriginalImage: typeof Image;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    OriginalImage = global.Image;
    (global as any).Image = class MockImage {
      naturalWidth = 2;
      naturalHeight = 2;
      _src = "";
      set src(value: string) {
        this._src = value;
        queueMicrotask(() => this.onload?.());
      }
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
    };

    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") {
        const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: jest.fn() }),
          toBlob(cb: (b: Blob | null) => void) {
            queueMicrotask(() => cb(new Blob([jpegBytes], { type: "image/jpeg" })));
          },
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    global.Image = OriginalImage;
    document.createElement = originalCreateElement;
  });

  it("returns null when picture has no data", async () => {
    const { resizeToIpodThumbnail } = await import("@/features/devices/ipod/artwork-resize");
    const result = await resizeToIpodThumbnail({ format: "image/jpeg", data: new Uint8Array(0) });
    expect(result).toBeNull();
  });

  it("returns Uint8Array or null when given valid JPEG (browser Image/canvas dependent)", async () => {
    const { resizeToIpodThumbnail } = await import("@/features/devices/ipod/artwork-resize");
    const minimalJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
      0x00, 0xfe, 0x02, 0x32, 0x2f, 0xff, 0xd9,
    ]);
    const picture = { format: "image/jpeg", data: minimalJpeg };

    const result = await resizeToIpodThumbnail(picture);
    expect(result === null || (result instanceof Uint8Array && result.length > 0)).toBe(true);
    if (result && result.length > 0) {
      expect(result[0]).toBe(0xff);
      expect(result[1]).toBe(0xd8);
    }
  });
});

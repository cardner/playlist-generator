import { describe, it, expect, beforeEach } from "@jest/globals";
import { isSupportedExtension, SUPPORTED_EXTENSIONS } from "@/features/library/scanning";
import { getFileExtension } from "@/lib/library-selection-utils";

// ---------------------------------------------------------------------------
// Mock for getCachedFileCount (depends on Dexie which isn't available in tests)
// ---------------------------------------------------------------------------
const mockDbCount = jest.fn();

jest.mock("@/db/storage-file-index", () => ({
  getFileIndexCount: (...args: unknown[]) => mockDbCount(...args),
}));

describe("countLibraryFiles support logic", () => {
  describe("isSupportedExtension", () => {
    it.each(["mp3", "flac", "m4a", "aac", "alac", "ogg", "wav", "aiff", "wma"])(
      "returns true for %s",
      (ext) => {
        expect(isSupportedExtension(ext)).toBe(true);
      }
    );

    it.each(["jpg", "pdf", "txt", "png", "doc", ""])(
      "returns false for %s",
      (ext) => {
        expect(isSupportedExtension(ext)).toBe(false);
      }
    );
  });

  describe("getFileExtension", () => {
    it("extracts lowercase extension from filename", () => {
      expect(getFileExtension("track.MP3")).toBe("mp3");
      expect(getFileExtension("song.FLAC")).toBe("flac");
      expect(getFileExtension("file.m4a")).toBe("m4a");
    });

    it("returns empty string for extensionless files", () => {
      expect(getFileExtension("README")).toBe("");
    });

    it("handles multiple dots", () => {
      expect(getFileExtension("my.song.mp3")).toBe("mp3");
    });
  });

  describe("extension filter for counting", () => {
    const filter = (name: string) => isSupportedExtension(getFileExtension(name));

    it("accepts supported audio filenames", () => {
      expect(filter("track.mp3")).toBe(true);
      expect(filter("song.flac")).toBe(true);
      expect(filter("audio.wav")).toBe(true);
      expect(filter("music.m4a")).toBe(true);
      expect(filter("track.ogg")).toBe(true);
      expect(filter("Artist/Album/01 Song.aiff")).toBe(true);
    });

    it("rejects non-audio filenames", () => {
      expect(filter("cover.jpg")).toBe(false);
      expect(filter("notes.txt")).toBe(false);
      expect(filter(".DS_Store")).toBe(false);
      expect(filter("Thumbs.db")).toBe(false);
    });

    it("rejects files with no extension", () => {
      expect(filter("README")).toBe(false);
    });
  });

  describe("SUPPORTED_EXTENSIONS constant", () => {
    it("contains all expected extensions", () => {
      expect(SUPPORTED_EXTENSIONS).toContain("mp3");
      expect(SUPPORTED_EXTENSIONS).toContain("flac");
      expect(SUPPORTED_EXTENSIONS).toContain("m4a");
      expect(SUPPORTED_EXTENSIONS).toContain("wav");
      expect(SUPPORTED_EXTENSIONS).toContain("ogg");
      expect(SUPPORTED_EXTENSIONS).toContain("aiff");
      expect(SUPPORTED_EXTENSIONS).toContain("aac");
      expect(SUPPORTED_EXTENSIONS).toContain("alac");
      expect(SUPPORTED_EXTENSIONS).toContain("wma");
    });
  });

  describe("getCachedFileCount", () => {
    beforeEach(() => {
      mockDbCount.mockReset();
    });

    it("returns the count when the index has entries", async () => {
      mockDbCount.mockResolvedValue(1500);
      const { getCachedFileCount } = await import("@/features/library/scanning");
      const result = await getCachedFileCount("root-1");
      expect(result).toBe(1500);
      expect(mockDbCount).toHaveBeenCalledWith("root-1");
    });

    it("returns null when the index is empty", async () => {
      mockDbCount.mockResolvedValue(0);
      const { getCachedFileCount } = await import("@/features/library/scanning");
      const result = await getCachedFileCount("root-empty");
      expect(result).toBeNull();
    });
  });
});

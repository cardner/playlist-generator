/**
 * Unit tests for buildFileIndexUpdateOnly (path-only update scan)
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { LibraryFile } from "@/lib/library-selection-types";
import type { FileIndexEntry } from "@/features/library/scanning";
import { generateSampleFileIndexEntries } from "./fixtures/metadata";

const mockGetLibraryFiles = jest.fn();

jest.mock("@/lib/library-selection", () => ({
  getLibraryFiles: (...args: unknown[]) => mockGetLibraryFiles(...args),
}));

jest.mock("@/lib/file-hash", () => ({
  hashFileContent: jest.fn(),
  hashFullFileContent: jest.fn(),
}));

async function* makeLibraryFileGenerator(
  items: Array<{
    trackFileId: string;
    relativePath: string;
    name: string;
    extension: string;
    size: number;
    mtime: number;
  }>
): AsyncGenerator<LibraryFile> {
  for (const item of items) {
    const file = new File([], item.name, { lastModified: item.mtime });
    Object.defineProperty(file, "size", { value: item.size });
    yield {
      file,
      trackFileId: item.trackFileId,
      relativePath: item.relativePath,
      extension: item.extension,
      size: item.size,
      mtime: item.mtime,
    };
  }
}

describe("buildFileIndexUpdateOnly", () => {
  const root = { mode: "handle" as const, name: "Test", handleId: "handle-1" };

  beforeEach(() => {
    mockGetLibraryFiles.mockClear();
  });

  it("carries forward existing entries and never hashes", async () => {
    const prevEntries = generateSampleFileIndexEntries(2);
    const prevIndex = new Map<string, FileIndexEntry>();
    prevEntries.forEach((e) => prevIndex.set(e.trackFileId, e));

    const [e1, e2] = prevEntries;
    mockGetLibraryFiles.mockReturnValue(
      makeLibraryFileGenerator([
        {
          trackFileId: e1.trackFileId,
          relativePath: e1.relativePath ?? e1.name,
          name: e1.name,
          extension: e1.extension,
          size: e1.size,
          mtime: e1.mtime,
        },
        {
          trackFileId: e2.trackFileId,
          relativePath: e2.relativePath ?? e2.name,
          name: e2.name,
          extension: e2.extension,
          size: e2.size,
          mtime: e2.mtime,
        },
      ])
    );

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    const { index, diff } = await buildFileIndexUpdateOnly(root, prevIndex);

    expect(index.size).toBe(2);
    expect(index.get(e1.trackFileId)).toBe(e1);
    expect(index.get(e2.trackFileId)).toBe(e2);
    expect(diff.added).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);

    const { hashFileContent, hashFullFileContent } = await import("@/lib/file-hash");
    expect(hashFileContent).not.toHaveBeenCalled();
    expect(hashFullFileContent).not.toHaveBeenCalled();
  });

  it("detects new files as added (without hashes)", async () => {
    const prevIndex = new Map<string, FileIndexEntry>();
    const newEntry = {
      trackFileId: "new-track-1",
      relativePath: "Music/new.mp3",
      name: "new.mp3",
      extension: "mp3",
      size: 5000,
      mtime: 1000,
    };
    mockGetLibraryFiles.mockReturnValue(makeLibraryFileGenerator([newEntry]));

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    const { index, diff } = await buildFileIndexUpdateOnly(root, prevIndex);

    expect(index.size).toBe(1);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].trackFileId).toBe(newEntry.trackFileId);
    expect(diff.added[0].contentHash).toBeUndefined();
    expect(diff.added[0].fullContentHash).toBeUndefined();
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("detects removed files", async () => {
    const [e1, e2] = generateSampleFileIndexEntries(2);
    const prevIndex = new Map<string, FileIndexEntry>();
    prevIndex.set(e1.trackFileId, e1);
    prevIndex.set(e2.trackFileId, e2);

    mockGetLibraryFiles.mockReturnValue(
      makeLibraryFileGenerator([
        {
          trackFileId: e1.trackFileId,
          relativePath: e1.relativePath ?? e1.name,
          name: e1.name,
          extension: e1.extension,
          size: e1.size,
          mtime: e1.mtime,
        },
      ])
    );

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    const { index, diff } = await buildFileIndexUpdateOnly(root, prevIndex);

    expect(index.size).toBe(1);
    expect(diff.added).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].trackFileId).toBe(e2.trackFileId);
  });

  it("preserves hashes from previous entries even when size/mtime changed", async () => {
    const [prevEntry] = generateSampleFileIndexEntries(1);
    prevEntry.contentHash = "prev-content-hash";
    prevEntry.fullContentHash = "prev-full-hash";
    const prevIndex = new Map<string, FileIndexEntry>();
    prevIndex.set(prevEntry.trackFileId, prevEntry);

    mockGetLibraryFiles.mockReturnValue(
      makeLibraryFileGenerator([
        {
          trackFileId: prevEntry.trackFileId,
          relativePath: prevEntry.relativePath ?? prevEntry.name,
          name: prevEntry.name,
          extension: prevEntry.extension,
          size: prevEntry.size + 100,
          mtime: prevEntry.mtime + 1000,
        },
      ])
    );

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    const { index, diff } = await buildFileIndexUpdateOnly(root, prevIndex);

    const entry = index.get(prevEntry.trackFileId);
    expect(entry).toBe(prevEntry);
    expect(entry?.contentHash).toBe("prev-content-hash");
    expect(entry?.fullContentHash).toBe("prev-full-hash");
    expect(diff.changed).toHaveLength(0);
  });

  it("handles mixed add + remove correctly", async () => {
    const [e1, e2, e3] = generateSampleFileIndexEntries(3);
    const prevIndex = new Map<string, FileIndexEntry>();
    prevIndex.set(e1.trackFileId, e1);
    prevIndex.set(e2.trackFileId, e2);
    prevIndex.set(e3.trackFileId, e3);

    const newFile = {
      trackFileId: "brand-new",
      relativePath: "Music/brand-new.flac",
      name: "brand-new.flac",
      extension: "flac",
      size: 10000,
      mtime: 2000,
    };

    mockGetLibraryFiles.mockReturnValue(
      makeLibraryFileGenerator([
        {
          trackFileId: e1.trackFileId,
          relativePath: e1.relativePath ?? e1.name,
          name: e1.name,
          extension: e1.extension,
          size: e1.size,
          mtime: e1.mtime,
        },
        newFile,
      ])
    );

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    const { index, diff } = await buildFileIndexUpdateOnly(root, prevIndex);

    expect(index.size).toBe(2);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].trackFileId).toBe("brand-new");
    expect(diff.removed).toHaveLength(2);
    const removedIds = diff.removed.map((r) => r.trackFileId).sort();
    expect(removedIds).toEqual([e2.trackFileId, e3.trackFileId].sort());
    expect(diff.changed).toHaveLength(0);
  });

  it("throws when root is not handle mode", async () => {
    const prevIndex = new Map<string, FileIndexEntry>();
    const fallbackRoot = { mode: "fallback" as const, name: "Test" };

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    await expect(
      buildFileIndexUpdateOnly(fallbackRoot as never, prevIndex)
    ).rejects.toThrow("Update scan requires handle mode");
  });

  it("skips unsupported extensions", async () => {
    const prevIndex = new Map<string, FileIndexEntry>();
    mockGetLibraryFiles.mockReturnValue(
      makeLibraryFileGenerator([
        {
          trackFileId: "txt-file",
          relativePath: "readme.txt",
          name: "readme.txt",
          extension: "txt",
          size: 100,
          mtime: 1000,
        },
      ])
    );

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    const { index, diff } = await buildFileIndexUpdateOnly(root, prevIndex);

    expect(index.size).toBe(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("respects abort signal", async () => {
    const prevIndex = new Map<string, FileIndexEntry>();
    const controller = new AbortController();
    controller.abort();

    mockGetLibraryFiles.mockReturnValue(
      makeLibraryFileGenerator([
        {
          trackFileId: "t1",
          relativePath: "Music/a.mp3",
          name: "a.mp3",
          extension: "mp3",
          size: 1000,
          mtime: 1000,
        },
      ])
    );

    const { buildFileIndexUpdateOnly } = await import(
      "@/features/library/scanning"
    );
    await expect(
      buildFileIndexUpdateOnly(root, prevIndex, undefined, controller.signal)
    ).rejects.toThrow("Scan aborted");
  });
});

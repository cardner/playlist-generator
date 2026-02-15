/**
 * Tests that scanLibraryWithPersistence passes existingLibraryRootId to saveLibraryRoot
 * so rescanning updates the correct collection instead of creating a duplicate.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

const mockSaveLibraryRoot = jest.fn();
const mockGetFileIndexEntries = jest.fn();
const mockCreateScanRun = jest.fn();
const mockBuildFileIndex = jest.fn();
const mockDiffFileIndex = jest.fn();
const mockSaveCheckpoint = jest.fn();
const mockSaveFileIndexEntries = jest.fn();
const mockRemoveFileIndexEntries = jest.fn();
const mockUpdateScanRun = jest.fn();

jest.mock("@/db/storage", () => ({
  saveLibraryRoot: (...args: unknown[]) => mockSaveLibraryRoot(...args),
  getFileIndexEntries: (...args: unknown[]) => mockGetFileIndexEntries(...args),
  createScanRun: (...args: unknown[]) => mockCreateScanRun(...args),
  updateScanRun: (...args: unknown[]) => mockUpdateScanRun(...args),
  saveFileIndexEntries: (...args: unknown[]) => mockSaveFileIndexEntries(...args),
  removeFileIndexEntries: (...args: unknown[]) => mockRemoveFileIndexEntries(...args),
}));

jest.mock("@/features/library/scanning", () => ({
  buildFileIndex: (...args: unknown[]) => mockBuildFileIndex(...args),
  diffFileIndex: (...args: unknown[]) => mockDiffFileIndex(...args),
}));

jest.mock("@/db/storage-scan-checkpoints", () => ({
  saveCheckpoint: (...args: unknown[]) => mockSaveCheckpoint(...args),
  loadCheckpoint: jest.fn().mockResolvedValue(null),
  deleteCheckpoint: jest.fn().mockResolvedValue(undefined),
}));

describe("scanLibraryWithPersistence with existingLibraryRootId", () => {
  const fakeRecord = {
    id: "existing-collection-123",
    mode: "handle" as const,
    name: "My Music",
    handleRef: "handle-ref-456",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    mockSaveLibraryRoot.mockReset();
    mockSaveLibraryRoot.mockResolvedValue(fakeRecord);
    mockGetFileIndexEntries.mockResolvedValue([]);
    mockCreateScanRun.mockResolvedValue({
      id: "scan-run-1",
      libraryRootId: fakeRecord.id,
      startedAt: Date.now(),
      finishedAt: null,
      total: 0,
      added: 0,
      changed: 0,
      removed: 0,
    });
    mockUpdateScanRun.mockResolvedValue(undefined);
    mockBuildFileIndex.mockResolvedValue(new Map());
    mockDiffFileIndex.mockReturnValue({ added: [], changed: [], removed: [] });
    mockSaveCheckpoint.mockResolvedValue(undefined);
    mockSaveFileIndexEntries.mockResolvedValue(undefined);
    mockRemoveFileIndexEntries.mockResolvedValue(undefined);
  });

  it("calls saveLibraryRoot with existingCollectionId when options.existingLibraryRootId is provided", async () => {
    const { scanLibraryWithPersistence } = await import(
      "@/features/library/scanning-persist"
    );
    const root = {
      mode: "handle" as const,
      name: "My Music",
      handleId: "handle-new-after-relink",
    };

    await scanLibraryWithPersistence(root, undefined, undefined, {
      existingLibraryRootId: "existing-collection-123",
    });

    expect(mockSaveLibraryRoot).toHaveBeenCalledWith(
      root,
      root.handleId,
      expect.objectContaining({
        setAsCurrent: false,
        existingCollectionId: "existing-collection-123",
      })
    );
  });
});

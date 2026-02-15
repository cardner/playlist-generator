/**
 * Tests for library root storage, including rescan-with-existing-collection behavior.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

const mockPut = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();

jest.mock("@/db/schema", () => ({
  db: {
    libraryRoots: {
      get: (...args: unknown[]) => mockGet(...args),
      put: (...args: unknown[]) => mockPut(...args),
    },
    settings: {
      put: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

describe("saveLibraryRoot", () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockGet.mockReset();
    mockGet.mockResolvedValue(undefined); // no existing record by default
  });

  it("uses root.handleId as record id when existingCollectionId is not provided", async () => {
    const { saveLibraryRoot } = await import("@/db/storage-library-root");
    const root = {
      mode: "handle" as const,
      name: "My Music",
      handleId: "handle-abc-123",
    };

    await saveLibraryRoot(root, root.handleId, { setAsCurrent: false });

    expect(mockPut).toHaveBeenCalledTimes(1);
    const record = mockPut.mock.calls[0][0];
    expect(record.id).toBe("handle-abc-123");
    expect(record.handleRef).toBe("handle-abc-123");
    expect(record.name).toBe("My Music");
  });

  it("uses existingCollectionId as record id when provided (rescan path)", async () => {
    const { saveLibraryRoot } = await import("@/db/storage-library-root");
    const existingId = "collection-original-456";
    const newHandleId = "handle-new-789";
    const root = {
      mode: "handle" as const,
      name: "My Music",
      handleId: newHandleId,
    };

    mockGet.mockResolvedValue({
      id: existingId,
      createdAt: 1000,
      handleRef: "old-handle",
    });

    await saveLibraryRoot(root, root.handleId, {
      setAsCurrent: false,
      existingCollectionId: existingId,
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    const record = mockPut.mock.calls[0][0];
    expect(record.id).toBe(existingId);
    expect(record.handleRef).toBe(newHandleId);
    expect(record.name).toBe("My Music");
  });

  it("updates handleRef on existing record when existingCollectionId is set (post-relink rescan)", async () => {
    const { saveLibraryRoot } = await import("@/db/storage-library-root");
    const existingId = "handle-old-111";
    const newHandleRef = "handle-after-relink-222";
    const root = {
      mode: "handle" as const,
      name: "My Music",
      handleId: newHandleRef,
    };

    mockGet.mockResolvedValue({
      id: existingId,
      createdAt: 2000,
      handleRef: "handle-old-111",
    });

    await saveLibraryRoot(root, root.handleId, {
      setAsCurrent: false,
      existingCollectionId: existingId,
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    const record = mockPut.mock.calls[0][0];
    expect(record.id).toBe(existingId);
    expect(record.handleRef).toBe(newHandleRef);
  });
});

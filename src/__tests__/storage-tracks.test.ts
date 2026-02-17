/**
 * Tests for track storage, including artwork cache cleanup on remove.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

const mockTracksBulkDelete = jest.fn().mockResolvedValue(undefined);
const mockArtworkCacheBulkDelete = jest.fn().mockResolvedValue(undefined);

jest.mock("@/db/schema", () => ({
  db: {
    tracks: {
      bulkDelete: (...args: unknown[]) => mockTracksBulkDelete(...args),
    },
    artworkCache: {
      bulkDelete: (...args: unknown[]) => mockArtworkCacheBulkDelete(...args),
    },
  },
  getCompositeId: (trackFileId: string, libraryRootId: string) =>
    `${trackFileId}-${libraryRootId}`,
}));

describe("removeTrackMetadata", () => {
  beforeEach(() => {
    mockTracksBulkDelete.mockClear();
    mockArtworkCacheBulkDelete.mockClear();
  });

  it("deletes tracks and artwork cache entries for the same composite ids", async () => {
    const { removeTrackMetadata } = await import("@/db/storage-tracks");
    const trackFileIds = ["track-a", "track-b"];
    const libraryRootId = "root-1";

    await removeTrackMetadata(trackFileIds, libraryRootId);

    const expectedIds = ["track-a-root-1", "track-b-root-1"];
    expect(mockTracksBulkDelete).toHaveBeenCalledTimes(1);
    expect(mockTracksBulkDelete).toHaveBeenCalledWith(expectedIds);
    expect(mockArtworkCacheBulkDelete).toHaveBeenCalledTimes(1);
    expect(mockArtworkCacheBulkDelete).toHaveBeenCalledWith(expectedIds);
  });

  it("calls both bulkDeletes even when trackFileIds is empty", async () => {
    const { removeTrackMetadata } = await import("@/db/storage-tracks");

    await removeTrackMetadata([], "root-1");

    expect(mockTracksBulkDelete).toHaveBeenCalledWith([]);
    expect(mockArtworkCacheBulkDelete).toHaveBeenCalledWith([]);
  });
});

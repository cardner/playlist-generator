import { db, getCompositeId } from "@/db/schema";
import type { FileIndexRecord, TrackRecord } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  buildMetadataFingerprint,
  resolveGlobalTrackIdentity,
  type GlobalTrackIdentity,
} from "./track-identity-utils";

export async function updateTrackIdentity(
  trackId: string
): Promise<GlobalTrackIdentity | null> {
  const track = await db.tracks.get(trackId);
  if (!track) return null;
  const fileIndex = await db.fileIndex.get(trackId);
  const metadataFingerprint =
    track.metadataFingerprint ?? buildMetadataFingerprint(track.tags, track.tech);
  const identity = resolveGlobalTrackIdentity(
    { ...track, metadataFingerprint },
    fileIndex
  );
  await db.tracks.update(trackId, {
    metadataFingerprint,
    globalTrackId: identity.globalTrackId,
    globalTrackSource: identity.globalTrackSource,
    globalTrackConfidence: identity.globalTrackConfidence,
  });
  return identity;
}

export async function resolveTrackIdentitiesForTrackFileIds(
  libraryRootId: string,
  trackFileIds: string[]
): Promise<void> {
  if (trackFileIds.length === 0) return;
  const compositeIds = trackFileIds.map((trackFileId) =>
    getCompositeId(trackFileId, libraryRootId)
  );
  const tracks = await db.tracks.bulkGet(compositeIds);
  const fileIndexes = await db.fileIndex.bulkGet(compositeIds);
  const updates: TrackRecord[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track) continue;
    const fileIndex = fileIndexes[i];
    const metadataFingerprint =
      track.metadataFingerprint ?? buildMetadataFingerprint(track.tags, track.tech);
    const identity = resolveGlobalTrackIdentity(
      { ...track, metadataFingerprint },
      fileIndex
    );
    const next = {
      ...track,
      metadataFingerprint,
      globalTrackId: identity.globalTrackId,
      globalTrackSource: identity.globalTrackSource,
      globalTrackConfidence: identity.globalTrackConfidence,
      updatedAt: Date.now(),
    };
    updates.push(next);
  }
  if (updates.length > 0) {
    await db.tracks.bulkPut(updates);
  }
}

export async function resolveTrackIdentitiesForLibrary(
  libraryRootId: string,
  options?: { onlyMissing?: boolean; signal?: AbortSignal; onProgress?: (progress: { processed: number; total: number; updated: number }) => void }
): Promise<void> {
  // First, get total count for progress reporting
  const total = await db.tracks
    .where("libraryRootId")
    .equals(libraryRootId)
    .count();
  
  let processed = 0;
  let updated = 0;
  const updates: TrackRecord[] = [];
  
  // Build fileIndex map incrementally using cursor-based iteration
  // Note: This still loads all fileIndex entries into memory, but they are typically
  // smaller than track records and we need to access them randomly during processing.
  // An alternative would be to query the database for each track, but that would
  // be significantly slower due to the I/O overhead.
  const fileIndexMap = new Map<string, FileIndexRecord>();
  await db.fileIndex
    .where("libraryRootId")
    .equals(libraryRootId)
    .each((entry) => {
      fileIndexMap.set(entry.trackFileId, entry);
    });
  
  // Process tracks in chunks using cursor-based pagination to avoid loading all into memory
  // and yield periodically to keep UI responsive
  const CHUNK_SIZE = 100;
  let lastId: string | undefined = undefined;
  let hasMore = true;
  
  while (hasMore) {
    if (options?.signal?.aborted) {
      throw new DOMException("Identity resolution aborted", "AbortError");
    }
    
    // Load next chunk of tracks using cursor-based pagination
    // Note: Using .and() with a filter doesn't fully leverage the database index,
    // but without a compound index on [libraryRootId, id], this is the best approach.
    // The alternative of using offset() would be slower as it has O(n) complexity.
    let query = db.tracks
      .where("libraryRootId")
      .equals(libraryRootId);
    
    if (lastId !== undefined) {
      // Continue from where we left off using the primary key
      query = query.and((track) => track.id > lastId!);
    }
    
    const chunk = await query.limit(CHUNK_SIZE).toArray();
    
    if (chunk.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const track of chunk) {
      processed += 1;
      lastId = track.id; // Update cursor for next iteration
      
      const fileIndex = fileIndexMap.get(track.trackFileId);
      const metadataFingerprint =
        track.metadataFingerprint ?? buildMetadataFingerprint(track.tags, track.tech);
      const identity = resolveGlobalTrackIdentity(
        { ...track, metadataFingerprint },
        fileIndex
      );
      const next = {
        ...track,
        metadataFingerprint,
        globalTrackId: identity.globalTrackId,
        globalTrackSource: identity.globalTrackSource,
        globalTrackConfidence: identity.globalTrackConfidence,
        updatedAt: Date.now(),
      };
      
      if (
        !options?.onlyMissing ||
        !track.globalTrackId ||
        track.globalTrackId !== next.globalTrackId ||
        track.metadataFingerprint !== next.metadataFingerprint
      ) {
        updates.push(next);
        updated += 1;
      }
      
      // Batch updates to reduce transaction overhead
      if (updates.length >= 250) {
        await db.tracks.bulkPut(updates.splice(0, updates.length));
      }
    }
    
    // Mark as complete if we got fewer items than requested
    if (chunk.length < CHUNK_SIZE) {
      hasMore = false;
    }
    
    // Yield to event loop after each chunk to avoid UI freeze
    await new Promise((resolve) => setTimeout(resolve, 0));
    options?.onProgress?.({ processed, total, updated });
  }
  
  // Write any remaining updates
  if (updates.length > 0) {
    await db.tracks.bulkPut(updates);
  }
  
  options?.onProgress?.({ processed, total, updated });
}

export async function findFileIndexByGlobalTrackId(
  globalTrackId: string,
  options?: {
    preferredRootId?: string;
    cache?: Map<string, FileIndexRecord | null>;
  }
): Promise<FileIndexRecord | undefined> {
  if (!globalTrackId) return undefined;
  const cache = options?.cache;
  if (cache?.has(globalTrackId)) {
    return cache.get(globalTrackId) ?? undefined;
  }
  const matches = await db.tracks
    .where("globalTrackId")
    .equals(globalTrackId)
    .toArray();
  if (matches.length === 0) {
    cache?.set(globalTrackId, null);
    return undefined;
  }
  const preferred = options?.preferredRootId;
  const ordered = preferred
    ? [
        ...matches.filter((t) => t.libraryRootId === preferred),
        ...matches.filter((t) => t.libraryRootId !== preferred),
      ]
    : matches;
  for (const match of ordered) {
    const id = getCompositeId(match.trackFileId, match.libraryRootId);
    const entry = await db.fileIndex.get(id);
    if (entry) {
      cache?.set(globalTrackId, entry);
      return entry;
    }
  }
  cache?.set(globalTrackId, null);
  return undefined;
}

export function buildTrackIdentityForResult(track: TrackRecord): GlobalTrackIdentity {
  const metadataFingerprint = buildMetadataFingerprint(track.tags, track.tech);
  const identity = resolveGlobalTrackIdentity(
    { ...track, metadataFingerprint },
    undefined
  );
  if (!identity.globalTrackId && !metadataFingerprint) {
    logger.debug("No global identity resolved for track", {
      trackFileId: track.trackFileId,
    });
  }
  return {
    ...identity,
    metadataFingerprint,
  };
}

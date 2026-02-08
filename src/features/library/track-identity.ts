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
  const tracks = await db.tracks
    .where("libraryRootId")
    .equals(libraryRootId)
    .toArray();
  const fileIndexEntries = await db.fileIndex
    .where("libraryRootId")
    .equals(libraryRootId)
    .toArray();
  const fileIndexMap = new Map<string, FileIndexRecord>();
  for (const entry of fileIndexEntries) {
    fileIndexMap.set(entry.trackFileId, entry);
  }
  const total = tracks.length;
  let processed = 0;
  let updated = 0;
  const updates: TrackRecord[] = [];
  for (const track of tracks) {
    if (options?.signal?.aborted) {
      throw new DOMException("Identity resolution aborted", "AbortError");
    }
    processed += 1;
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
    if (updates.length >= 250) {
      await db.tracks.bulkPut(updates.splice(0, updates.length));
    }
    if (processed % 100 === 0) {
      options?.onProgress?.({ processed, total, updated });
    }
  }
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
  
  // Build all composite IDs and fetch in parallel using bulkGet
  const compositeIds = ordered.map((match) => 
    getCompositeId(match.trackFileId, match.libraryRootId)
  );
  const entries = await db.fileIndex.bulkGet(compositeIds);
  
  // Find the first non-null entry (maintains ordering preference)
  for (const entry of entries) {
    if (entry) {
      cache?.set(globalTrackId, entry);
      return entry;
    }
  }
  
  cache?.set(globalTrackId, null);
  return undefined;
}

export async function buildTrackIdentityForResult(track: TrackRecord): Promise<GlobalTrackIdentity> {
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

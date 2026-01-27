/**
 * Writeback status storage operations
 */

import { db, getCompositeId } from "./schema";
import type { TrackWritebackRecord } from "./schema";
import type { WritebackField } from "@/features/library/metadata-writeback";

export async function markTrackWritebackPending(
  trackFileId: string,
  libraryRootId: string,
  fields: WritebackField[]
): Promise<void> {
  const id = getCompositeId(trackFileId, libraryRootId);
  const existing = await db.trackWritebacks.get(id);
  const mergedFields = Array.from(
    new Set([...(existing?.pendingFields ?? []), ...fields])
  );
  const record: TrackWritebackRecord = {
    id,
    trackFileId,
    libraryRootId,
    pendingFields: mergedFields,
    pending: mergedFields.length > 0,
    lastWritebackAt: existing?.lastWritebackAt,
    lastWritebackError: existing?.lastWritebackError,
    lastWritebackTarget: existing?.lastWritebackTarget,
    updatedAt: Date.now(),
  };
  await db.trackWritebacks.put(record);
}

export async function clearTrackWritebackPending(
  trackFileId: string,
  libraryRootId: string,
  fields: WritebackField[] | null,
  target: TrackWritebackRecord["lastWritebackTarget"]
): Promise<void> {
  const id = getCompositeId(trackFileId, libraryRootId);
  const existing = await db.trackWritebacks.get(id);
  if (!existing) {
    return;
  }
  const fieldSet = new Set<string>(fields ?? []);
  const remainingFields =
    fieldSet.size > 0
      ? existing.pendingFields.filter((field) => !fieldSet.has(field))
      : [];
  await db.trackWritebacks.put({
    ...existing,
    pendingFields: remainingFields,
    pending: remainingFields.length > 0,
    lastWritebackAt: Date.now(),
    lastWritebackError: undefined,
    lastWritebackTarget: target,
    updatedAt: Date.now(),
  });
}

export async function setTrackWritebackError(
  trackFileId: string,
  libraryRootId: string,
  error: string
): Promise<void> {
  const id = getCompositeId(trackFileId, libraryRootId);
  const existing = await db.trackWritebacks.get(id);
  const pendingFields = existing?.pendingFields ?? [];
  await db.trackWritebacks.put({
    id,
    trackFileId,
    libraryRootId,
    pendingFields,
    pending: pendingFields.length > 0,
    lastWritebackAt: existing?.lastWritebackAt,
    lastWritebackError: error,
    lastWritebackTarget: existing?.lastWritebackTarget,
    updatedAt: Date.now(),
  });
}

export async function getPendingWritebacks(
  libraryRootId: string
): Promise<TrackWritebackRecord[]> {
  return db.trackWritebacks
    .where("libraryRootId")
    .equals(libraryRootId)
    .filter((record) => record.pending)
    .toArray();
}

export async function getWritebackStatuses(
  libraryRootId: string
): Promise<TrackWritebackRecord[]> {
  return db.trackWritebacks.where("libraryRootId").equals(libraryRootId).toArray();
}


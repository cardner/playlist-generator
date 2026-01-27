/**
 * Writeback checkpoint storage operations
 */

import { db } from "./schema";
import type { WritebackCheckpointRecord } from "./schema";
import { logger } from "@/lib/logger";

export async function saveWritebackCheckpoint(
  writebackRunId: string,
  libraryRootId: string,
  totalEntries: number,
  lastWrittenIndex: number,
  lastWrittenPath: string | undefined,
  errors: number,
  interrupted: boolean
): Promise<WritebackCheckpointRecord> {
  await db.open();
  if (!db.writebackCheckpoints) {
    throw new Error("writebackCheckpoints table not available - database upgrade required");
  }

  const checkpoint: WritebackCheckpointRecord = {
    id: writebackRunId,
    writebackRunId,
    libraryRootId,
    totalEntries,
    lastWrittenIndex,
    lastWrittenPath,
    errors,
    checkpointAt: Date.now(),
    interrupted,
  };
  await db.writebackCheckpoints.put(checkpoint);
  return checkpoint;
}

export async function loadWritebackCheckpoint(
  writebackRunId: string
): Promise<WritebackCheckpointRecord | null> {
  try {
    await db.open();
    if (!db.writebackCheckpoints) {
      return null;
    }
    return (await db.writebackCheckpoints.get(writebackRunId)) || null;
  } catch (error) {
    logger.debug("Could not access writeback checkpoints table:", error);
    return null;
  }
}

export async function deleteWritebackCheckpoint(
  writebackRunId: string
): Promise<void> {
  try {
    await db.open();
    if (!db.writebackCheckpoints) {
      return;
    }
    await db.writebackCheckpoints.delete(writebackRunId);
  } catch (error) {
    logger.debug("Could not delete writeback checkpoint:", error);
  }
}

export async function getInterruptedWritebackCheckpoints(
  libraryRootId: string
): Promise<WritebackCheckpointRecord[]> {
  try {
    await db.open();
    if (!db.writebackCheckpoints) {
      return [];
    }
    return db.writebackCheckpoints
      .where("libraryRootId")
      .equals(libraryRootId)
      .sortBy("checkpointAt");
  } catch (error) {
    logger.debug("Could not access writeback checkpoints:", error);
    return [];
  }
}

export async function deleteWritebackCheckpointsForLibrary(
  libraryRootId: string
): Promise<void> {
  try {
    await db.open();
    if (!db.writebackCheckpoints) {
      return;
    }
    const records = await db.writebackCheckpoints
      .where("libraryRootId")
      .equals(libraryRootId)
      .toArray();
    const ids = records.map((record) => record.id);
    if (ids.length > 0) {
      await db.writebackCheckpoints.bulkDelete(ids);
    }
  } catch (error) {
    logger.debug("Could not delete writeback checkpoints:", error);
  }
}


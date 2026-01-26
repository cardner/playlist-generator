/**
 * Processing Checkpoint Storage Operations
 *
 * Handles storage for metadata parsing checkpoints to support resuming
 * interrupted processing runs.
 */

import { db } from "./schema";
import type { ProcessingCheckpointRecord } from "./schema";
import { logger } from "@/lib/logger";

export async function saveProcessingCheckpoint(
  scanRunId: string,
  libraryRootId: string,
  totalEntries: number,
  lastProcessedIndex: number,
  lastProcessedPath: string | undefined,
  errors: number,
  interrupted: boolean
): Promise<ProcessingCheckpointRecord> {
  await db.open();

  if (!db.processingCheckpoints) {
    throw new Error("processingCheckpoints table not available - database upgrade required");
  }

  const checkpoint: ProcessingCheckpointRecord = {
    id: scanRunId,
    scanRunId,
    libraryRootId,
    totalEntries,
    lastProcessedIndex,
    lastProcessedPath,
    errors,
    checkpointAt: Date.now(),
    interrupted,
  };

  await db.processingCheckpoints.put(checkpoint);
  return checkpoint;
}

export async function loadProcessingCheckpoint(
  scanRunId: string
): Promise<ProcessingCheckpointRecord | null> {
  try {
    await db.open();
    if (!db.processingCheckpoints) {
      return null;
    }
    return (await db.processingCheckpoints.get(scanRunId)) || null;
  } catch (error) {
    logger.debug("Could not access processingCheckpoints table:", error);
    return null;
  }
}

export async function deleteProcessingCheckpoint(scanRunId: string): Promise<void> {
  try {
    await db.open();
    if (!db.processingCheckpoints) {
      return;
    }
    await db.processingCheckpoints.delete(scanRunId);
  } catch (error) {
    logger.debug("Could not delete processing checkpoint:", error);
  }
}

export async function getInterruptedProcessingCheckpoints(
  libraryRootId: string
): Promise<ProcessingCheckpointRecord[]> {
  try {
    await db.open();
    if (!db.processingCheckpoints) {
      return [];
    }

    return db.processingCheckpoints
      .where("libraryRootId")
      .equals(libraryRootId)
      .sortBy("checkpointAt");
  } catch (error) {
    logger.debug("Could not access processing checkpoints:", error);
    return [];
  }
}

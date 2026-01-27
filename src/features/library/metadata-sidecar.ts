/**
 * Sidecar metadata storage for writeback fallback
 */

import type { NormalizedTags, MetadataResult } from "./metadata";
import { logger } from "@/lib/logger";
import { db } from "@/db/schema";
import { updateTrackMetadata } from "@/db/storage-tracks";

export interface SidecarMetadata {
  version: 1;
  trackFileId: string;
  relativePath?: string;
  tags: NormalizedTags;
  bpm?: number;
  tempoCategory?: "slow" | "medium" | "fast";
  mood?: string[];
  updatedAt: number;
}

const SIDECAR_ROOT_DIR = ".ai-playlist-generator";
const SIDECAR_SUBDIR = "sidecars";

export async function getLibraryRootHandle(
  libraryRootId: string
): Promise<FileSystemDirectoryHandle | null> {
  const libraryRoot = await db.libraryRoots.get(libraryRootId);
  if (!libraryRoot?.handleRef) {
    return null;
  }
  const handleRecord = await db.directoryHandles.get(libraryRoot.handleRef);
  return (handleRecord?.handle as FileSystemDirectoryHandle | undefined) ?? null;
}

async function getSidecarDirectory(
  rootHandle: FileSystemDirectoryHandle,
  create: boolean
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const rootDir = await rootHandle.getDirectoryHandle(SIDECAR_ROOT_DIR, { create });
    return await rootDir.getDirectoryHandle(SIDECAR_SUBDIR, { create });
  } catch (error) {
    logger.debug("Failed to access sidecar directory:", error);
    return null;
  }
}

export async function writeSidecarMetadata(
  rootHandle: FileSystemDirectoryHandle,
  metadata: SidecarMetadata
): Promise<void> {
  const sidecarDir = await getSidecarDirectory(rootHandle, true);
  if (!sidecarDir) {
    throw new Error("Unable to access sidecar directory");
  }

  const fileHandle = await sidecarDir.getFileHandle(`${metadata.trackFileId}.json`, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(metadata, null, 2));
  await writable.close();
}

export async function readSidecarMetadata(
  rootHandle: FileSystemDirectoryHandle,
  trackFileId: string
): Promise<SidecarMetadata | null> {
  const sidecarDir = await getSidecarDirectory(rootHandle, false);
  if (!sidecarDir) {
    return null;
  }

  try {
    const fileHandle = await sidecarDir.getFileHandle(`${trackFileId}.json`);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text) as SidecarMetadata;
    if (!data || data.trackFileId !== trackFileId) {
      return null;
    }
    return data;
  } catch (error) {
    return null;
  }
}

export async function readSidecarMetadataForTracks(
  libraryRootId: string,
  trackFileIds: string[]
): Promise<Map<string, SidecarMetadata>> {
  const map = new Map<string, SidecarMetadata>();
  if (trackFileIds.length === 0) {
    return map;
  }
  const rootHandle = await getLibraryRootHandle(libraryRootId);
  if (!rootHandle) {
    return map;
  }

  for (const trackFileId of trackFileIds) {
    const sidecar = await readSidecarMetadata(rootHandle, trackFileId);
    if (sidecar) {
      map.set(trackFileId, sidecar);
    }
  }
  return map;
}

export function applySidecarToResults(
  results: MetadataResult[],
  sidecarMap: Map<string, SidecarMetadata>
): MetadataResult[] {
  if (sidecarMap.size === 0) {
    return results;
  }
  return results.map((result) => {
    const sidecar = sidecarMap.get(result.trackFileId);
    if (!sidecar) {
      return result;
    }
    const nextTags = sidecar.tags || result.tags;
    const bpm = sidecar.bpm;
    const nextTech =
      bpm !== undefined
        ? {
            ...result.tech,
            bpm,
            bpmSource: "manual" as const,
            bpmConfidence: 1,
          }
        : result.tech;
    return {
      ...result,
      tags: nextTags,
      tech: nextTech,
    };
  });
}

export async function applySidecarEnhancements(
  libraryRootId: string,
  sidecarMap: Map<string, SidecarMetadata>
): Promise<void> {
  if (sidecarMap.size === 0) {
    return;
  }

  const updates = Array.from(sidecarMap.values());
  for (const sidecar of updates) {
    const trackId = `${sidecar.trackFileId}-${libraryRootId}`;
    const existing = await db.tracks.get(trackId);
    if (!existing) {
      continue;
    }
    const enhancedUpdates: { tempo?: number | "slow" | "medium" | "fast"; mood?: string[] } = {};

    if (sidecar.bpm !== undefined) {
      enhancedUpdates.tempo = sidecar.bpm;
      await db.tracks.update(trackId, {
        tech: {
          ...existing.tech,
          bpm: sidecar.bpm,
          bpmSource: "manual",
          bpmConfidence: 1,
        },
      });
    } else if (sidecar.tempoCategory) {
      enhancedUpdates.tempo = sidecar.tempoCategory;
    }
    if (sidecar.mood?.length) {
      enhancedUpdates.mood = sidecar.mood;
    }

    if (Object.keys(enhancedUpdates).length > 0) {
      await updateTrackMetadata(trackId, enhancedUpdates, false, {
        skipWriteback: true,
      });
    }
  }
}


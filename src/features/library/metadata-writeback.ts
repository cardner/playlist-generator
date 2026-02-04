/**
 * Metadata writeback utilities and mappings
 *
 * Defines writeback payloads and helpers to translate TrackRecord
 * fields into on-disk tags and sidecar metadata.
 */

import type { TrackRecord } from "@/db/schema";
import type { EnhancedMetadata, NormalizedTags } from "./metadata";

export type WritebackField =
  | "title"
  | "artist"
  | "album"
  | "genres"
  | "year"
  | "trackNo"
  | "discNo"
  | "tempo"
  | "mood"
  | "activity";

export type WritebackTarget = "file" | "sidecar";

export interface WritebackPayload {
  tags: NormalizedTags;
  bpm?: number;
  tempoCategory?: "slow" | "medium" | "fast";
  mood?: string[];
  activity?: string[];
}

export function buildWritebackPayload(track: TrackRecord): WritebackPayload {
  const enhanced = track.enhancedMetadata;
  const tags = track.tags;
  const bpm = typeof enhanced?.tempo === "number" ? enhanced.tempo : track.tech?.bpm;
  const tempoCategory =
    typeof enhanced?.tempo === "string" ? enhanced.tempo : undefined;
  const mood = enhanced?.mood?.length ? enhanced.mood : undefined;
  const activity = enhanced?.activity?.length ? enhanced.activity : undefined;
  const genres = enhanced?.genres?.length ? enhanced.genres : tags.genres;

  return {
    tags: {
      title: tags.title,
      artist: tags.artist,
      album: tags.album,
      genres,
      year: tags.year,
      trackNo: tags.trackNo,
      discNo: tags.discNo,
    },
    bpm,
    tempoCategory,
    mood,
    activity,
  };
}

export function getWritebackFieldsFromEnhancedUpdates(
  updates: Partial<EnhancedMetadata>
): WritebackField[] {
  const fields: WritebackField[] = [];
  if (updates.genres !== undefined) fields.push("genres");
  if (updates.tempo !== undefined) fields.push("tempo");
  if (updates.mood !== undefined) fields.push("mood");
  if (updates.activity !== undefined) fields.push("activity");
  return fields;
}


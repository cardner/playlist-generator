import type { TrackRecord } from "@/db/schema";
import type { LLMConfig } from "@/types/playlist";
import { getCompositeId } from "@/db/schema";
import {
  filterTracksByGenre,
  searchTracks,
  searchTracksByAlbum,
  searchTracksByArtist,
  searchTracksByMood,
  searchTracksByTempo,
} from "@/db/storage";
import { getAllTracks, getTracks } from "@/db/storage";
import { updateTrackActivity, updateTrackMood } from "@/db/storage-tracks";
import { inferTrackMoodWithLLM } from "@/features/library/mood-inference";
import { mapMoodTagsToCategories, normalizeMoodCategory } from "@/features/library/mood-mapping";
import { inferTrackActivityWithLLM } from "@/features/library/activity-inference";
import {
  mapActivityTagsToCategories,
  normalizeActivityCategory,
} from "@/features/library/activity-mapping";

export type TrackSearchType = "track" | "artist" | "album" | "genre" | "tempo" | "mood" | "activity";

interface TrackSearchParams {
  query: string;
  type: TrackSearchType;
  limit?: number;
  libraryRootId?: string;
  llmConfig?: LLMConfig;
}

const mappedMoodCache = new Map<string, string[]>();
let moodMappingWarm = false;
const mappedActivityCache = new Map<string, string[]>();
let activityMappingWarm = false;

function warmMoodMappingCache(tracks: TrackRecord[]) {
  if (moodMappingWarm) return;
  moodMappingWarm = true;

  setTimeout(() => {
    for (const track of tracks) {
      const tags = track.enhancedMetadata?.mood || [];
      if (tags.length === 0) continue;
      const mapped = mapMoodTagsToCategories(tags);
      if (mapped.length > 0) {
        mappedMoodCache.set(track.trackFileId, mapped);
      }
    }
  }, 0);
}

function warmActivityMappingCache(tracks: TrackRecord[]) {
  if (activityMappingWarm) return;
  activityMappingWarm = true;

  setTimeout(() => {
    for (const track of tracks) {
      const tags = track.enhancedMetadata?.activity || [];
      if (tags.length === 0) continue;
      const mapped = mapActivityTagsToCategories(tags);
      if (mapped.length > 0) {
        mappedActivityCache.set(track.trackFileId, mapped);
      }
    }
  }, 0);
}

function getMappedMoodsForTrack(track: TrackRecord): string[] {
  const cached = mappedMoodCache.get(track.trackFileId);
  if (cached) return cached;
  const tags = track.enhancedMetadata?.mood || [];
  if (tags.length === 0) return [];
  const mapped = mapMoodTagsToCategories(tags);
  if (mapped.length > 0) {
    mappedMoodCache.set(track.trackFileId, mapped);
  }
  return mapped;
}

function getMappedActivitiesForTrack(track: TrackRecord): string[] {
  const cached = mappedActivityCache.get(track.trackFileId);
  if (cached) return cached;
  const tags = track.enhancedMetadata?.activity || [];
  if (tags.length === 0) return [];
  const mapped = mapActivityTagsToCategories(tags);
  if (mapped.length > 0) {
    mappedActivityCache.set(track.trackFileId, mapped);
  }
  return mapped;
}

function parseTempoQuery(query: string): "slow" | "medium" | "fast" | { min: number; max: number } | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "slow" || normalized === "medium" || normalized === "fast") {
    return normalized;
  }

  const rangeMatch = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      return { min, max };
    }
  }

  const bpm = Number(normalized);
  if (!Number.isNaN(bpm)) {
    return { min: bpm - 5, max: bpm + 5 };
  }

  return null;
}

async function searchByMood(
  query: string,
  limit: number,
  libraryRootId?: string,
  llmConfig?: LLMConfig
): Promise<TrackRecord[]> {
  const normalizedMood = normalizeMoodCategory(query);
  if (!normalizedMood) {
    return [];
  }

  const allTracks = libraryRootId ? await getTracks(libraryRootId) : await getAllTracks();
  warmMoodMappingCache(allTracks);

  const mappedMatches: TrackRecord[] = [];
  for (const track of allTracks) {
    const mapped = getMappedMoodsForTrack(track);
    if (mapped.includes(normalizedMood)) {
      mappedMatches.push(track);
    }
    if (mappedMatches.length >= limit) {
      return mappedMatches.slice(0, limit);
    }
  }

  if (!llmConfig || !llmConfig.apiKey || !llmConfig.provider) {
    return mappedMatches.slice(0, limit);
  }

  // If we still need more results, infer moods for tracks without mapped tags
  const remainingSlots = limit - mappedMatches.length;
  if (remainingSlots <= 0) {
    return mappedMatches.slice(0, limit);
  }

  const candidates = allTracks.filter((track) => getMappedMoodsForTrack(track).length === 0);
  for (const track of candidates) {
    if (mappedMatches.length >= limit) break;

    const inference = await inferTrackMoodWithLLM(track, llmConfig.provider, llmConfig.apiKey);
    if (!inference || inference.moods.length === 0) {
      continue;
    }

    const mapped = inference.moods
      .map((mood) => normalizeMoodCategory(mood))
      .filter((mood): mood is string => !!mood);

    if (mapped.length === 0) {
      continue;
    }

    mappedMoodCache.set(track.trackFileId, mapped);
    if (mapped.includes(normalizedMood)) {
      mappedMatches.push(track);
    }

    if (!track.enhancedMetadata?.mood || track.enhancedMetadata.mood.length === 0) {
      const trackId = getCompositeId(track.trackFileId, track.libraryRootId);
      await updateTrackMood(trackId, mapped, false);
    }
  }

  return mappedMatches.slice(0, limit);
}

async function searchByActivity(
  query: string,
  limit: number,
  libraryRootId?: string,
  llmConfig?: LLMConfig
): Promise<TrackRecord[]> {
  const normalizedActivity = normalizeActivityCategory(query);
  if (!normalizedActivity) {
    return [];
  }

  const allTracks = libraryRootId ? await getTracks(libraryRootId) : await getAllTracks();
  warmActivityMappingCache(allTracks);

  const mappedMatches: TrackRecord[] = [];
  for (const track of allTracks) {
    const mapped = getMappedActivitiesForTrack(track);
    if (mapped.includes(normalizedActivity)) {
      mappedMatches.push(track);
    }
    if (mappedMatches.length >= limit) {
      return mappedMatches.slice(0, limit);
    }
  }

  if (!llmConfig || !llmConfig.apiKey || !llmConfig.provider) {
    return mappedMatches.slice(0, limit);
  }

  const remainingSlots = limit - mappedMatches.length;
  if (remainingSlots <= 0) {
    return mappedMatches.slice(0, limit);
  }

  const candidates = allTracks.filter((track) => getMappedActivitiesForTrack(track).length === 0);
  for (const track of candidates) {
    if (mappedMatches.length >= limit) break;

    const inference = await inferTrackActivityWithLLM(track, llmConfig.provider, llmConfig.apiKey);
    if (!inference || inference.activity.length === 0) {
      continue;
    }

    const mapped = inference.activity
      .map((activity) => normalizeActivityCategory(activity))
      .filter((activity): activity is string => !!activity);

    if (mapped.length === 0) {
      continue;
    }

    mappedActivityCache.set(track.trackFileId, mapped);
    if (mapped.includes(normalizedActivity)) {
      mappedMatches.push(track);
    }

    if (!track.enhancedMetadata?.activity || track.enhancedMetadata.activity.length === 0) {
      const trackId = getCompositeId(track.trackFileId, track.libraryRootId);
      await updateTrackActivity(trackId, mapped, false);
    }
  }

  return mappedMatches.slice(0, limit);
}

export async function searchTracksByCriteria({
  query,
  type,
  limit = 25,
  libraryRootId,
  llmConfig,
}: TrackSearchParams): Promise<TrackRecord[]> {
  switch (type) {
    case "track":
      return searchTracks(query, libraryRootId, limit);
    case "artist":
      return searchTracksByArtist(query, limit, libraryRootId);
    case "album":
      return searchTracksByAlbum(query, limit, libraryRootId);
    case "genre":
      return filterTracksByGenre(query, libraryRootId, limit);
    case "tempo": {
      const tempoQuery = parseTempoQuery(query);
      if (!tempoQuery) return [];
      return searchTracksByTempo(tempoQuery, limit, libraryRootId);
    }
    case "mood":
      return searchByMood(query, limit, libraryRootId, llmConfig);
    case "activity":
      return searchByActivity(query, limit, libraryRootId, llmConfig);
    default:
      return [];
  }
}


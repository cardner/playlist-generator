import type { GeneratedPlaylist } from "./matching-engine";
import type { PlaylistRequest, TempoSpec } from "@/types/playlist";
import { getCurrentLibrarySummary } from "@/features/library/summarization";
import { getStrategy } from "./strategy";
import { generatePlaylistFromStrategy } from "./generation";

type RemixRequest = PlaylistRequest & { collectionId?: string };

function getMixEntries(
  mix?: Map<string, number> | Record<string, number>
): Array<[string, number]> {
  if (!mix) return [];
  if (mix instanceof Map) {
    return Array.from(mix.entries());
  }
  return Object.entries(mix);
}

function getTopKeys(
  mix?: Map<string, number> | Record<string, number>,
  limit: number = 5
): string[] {
  return getMixEntries(mix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function inferTempoFromSummary(
  mix?: Map<string, number> | Record<string, number>
): TempoSpec {
  const entries = getMixEntries(mix);
  if (entries.length === 0) return {};
  const top = entries.sort((a, b) => b[1] - a[1])[0]?.[0] as
    | "slow"
    | "medium"
    | "fast"
    | undefined;
  return top ? { bucket: top } : {};
}

function clampSurprise(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

export function buildRemixRequest(
  playlist: GeneratedPlaylist,
  storedRequest?: PlaylistRequest
): PlaylistRequest {
  if (storedRequest) {
    return {
      ...storedRequest,
      genres: storedRequest.genres ?? [],
      mood: storedRequest.mood ?? [],
      activity: storedRequest.activity ?? [],
      tempo: storedRequest.tempo ?? {},
    };
  }

  const strategy = playlist.strategy;
  const genreGuidance = strategy?.genreMixGuidance;
  const tempoGuidance = strategy?.tempoGuidance;

  const genres = Array.from(
    new Set([
      ...(genreGuidance?.primaryGenres || []),
      ...(genreGuidance?.secondaryGenres || []),
      ...getTopKeys(playlist.summary?.genreMix, 5),
    ])
  );

  const tempo: TempoSpec = tempoGuidance?.bpmRange
    ? { bpmRange: tempoGuidance.bpmRange }
    : tempoGuidance?.targetBucket
      ? { bucket: tempoGuidance.targetBucket }
      : inferTempoFromSummary(playlist.summary?.tempoMix);

  const totalDuration = playlist.summary?.totalDuration ?? 0;
  const trackCount = playlist.summary?.trackCount ?? playlist.trackFileIds.length;
  const useMinutes = totalDuration > 0;
  const lengthValue = useMinutes
    ? Math.max(1, Math.round(totalDuration / 60))
    : Math.max(1, trackCount || 1);

  const enableDiscovery = (playlist.discoveryTracks?.length || 0) > 0;

  return {
    genres,
    length: {
      type: useMinutes ? "minutes" : "tracks",
      value: lengthValue,
    },
    mood: (strategy?.vibeTags || []).map((tag) => tag.toLowerCase()),
    activity: [],
    tempo,
    surprise: clampSurprise(strategy?.scoringWeights?.diversity, 0.3),
    enableDiscovery,
    discoveryFrequency: enableDiscovery ? "every" : undefined,
    agentType: "built-in",
  };
}

export async function remixSavedPlaylist(options: {
  playlist: GeneratedPlaylist;
  storedRequest?: PlaylistRequest;
  libraryRootId?: string;
  title?: string;
  description?: string;
}): Promise<{ playlist: GeneratedPlaylist; request: RemixRequest }> {
  const { playlist, storedRequest, libraryRootId, title, description } = options;
  const baseRequest = buildRemixRequest(playlist, storedRequest);
  const summary = await getCurrentLibrarySummary(false, libraryRootId);
  const strategy = await getStrategy(baseRequest, summary);

  const seed = `remix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const excludeTrackIds = playlist.trackFileIds.filter(
    (trackId) => !trackId.startsWith("discovery:")
  );

  let generated: GeneratedPlaylist;
  try {
    generated = await generatePlaylistFromStrategy(
      baseRequest,
      strategy,
      libraryRootId,
      seed,
      excludeTrackIds
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("after filtering")
    ) {
      generated = await generatePlaylistFromStrategy(
        baseRequest,
        strategy,
        libraryRootId,
        seed
      );
    } else {
      throw error;
    }
  }

  const remixTitle = title?.trim() || `${playlist.title} (Remix)`;
  const remixDescription = description?.trim() || playlist.description;

  const request: RemixRequest = libraryRootId
    ? { ...baseRequest, collectionId: libraryRootId }
    : baseRequest;

  return {
    playlist: {
      ...generated,
      title: remixTitle,
      description: remixDescription,
      customEmoji: playlist.customEmoji ?? generated.customEmoji,
    },
    request,
  };
}

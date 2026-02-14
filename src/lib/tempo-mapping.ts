export type TempoBucket = "slow" | "medium" | "fast";

export const TEMPO_BUCKET_RANGES: Record<
  TempoBucket,
  { min: number; max: number }
> = {
  slow: { min: 60, max: 89 },
  medium: { min: 90, max: 139 },
  fast: { min: 140, max: 200 },
};

export const TEMPO_BUCKET_MOODS: Record<TempoBucket, string[]> = {
  slow: ["calm", "chill", "relaxed", "ambient"],
  medium: ["focused", "uplifting", "groovy", "steady"],
  fast: ["energetic", "intense", "excited", "driving"],
};

export const TEMPO_BUCKET_ACTIVITIES: Record<TempoBucket, string[]> = {
  slow: ["sleep", "reading", "meditation", "relaxing", "yoga"],
  medium: ["work", "study", "commute", "cooking", "cleaning", "creative", "gaming", "walking"],
  fast: ["workout", "running", "party", "dance", "cycling"],
};

function mergeUnique(base: string[], additions: string[]) {
  const set = new Set(base.map((value) => value.toLowerCase().trim()).filter(Boolean));
  for (const value of additions) {
    const key = value.toLowerCase().trim();
    if (!set.has(key)) {
      base.push(value);
      set.add(key);
    }
  }
  return base;
}

export function applyTempoMappingsToRequest<T extends {
  mood: string[];
  activity: string[];
  tempo: { bucket?: TempoBucket; bpmRange?: { min: number; max: number } };
}>(request: T): T {
  const bucket = request.tempo.bucket;
  if (!bucket) return request;

  if (!request.tempo.bpmRange) {
    request.tempo.bpmRange = { ...TEMPO_BUCKET_RANGES[bucket] };
  }

  if (Array.isArray(request.mood)) {
    mergeUnique(request.mood, TEMPO_BUCKET_MOODS[bucket]);
  }
  if (Array.isArray(request.activity)) {
    mergeUnique(request.activity, TEMPO_BUCKET_ACTIVITIES[bucket]);
  }

  return request;
}


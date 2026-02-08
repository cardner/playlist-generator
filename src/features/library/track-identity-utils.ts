import type { TrackRecord, FileIndexRecord } from "@/db/schema";
import type { NormalizedTags, TechInfo } from "./metadata";
import { hashStringToId } from "@/lib/string-hash";

export type GlobalTrackSource =
  | "musicbrainz"
  | "isrc"
  | "full-hash"
  | "partial-hash"
  | "metadata";

export type GlobalTrackIdentity = {
  globalTrackId?: string;
  globalTrackSource?: GlobalTrackSource;
  globalTrackConfidence?: number;
  metadataFingerprint?: string;
};

function normalizeFingerprintValue(value?: string | number | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMetadataFingerprint(
  tags?: NormalizedTags,
  tech?: TechInfo
): string | undefined {
  if (!tags) return undefined;
  const title = normalizeFingerprintValue(tags.title);
  const artist = normalizeFingerprintValue(tags.artist);
  const album = normalizeFingerprintValue(tags.album);
  const duration = tech?.durationSeconds ? Math.round(tech.durationSeconds) : "";
  if (!title || !artist) return undefined;
  const raw = [artist, title, album, duration].filter(Boolean).join("|");
  if (!raw) return undefined;
  return hashStringToId(raw);
}

export function resolveGlobalTrackIdentity(
  track: Pick<
    TrackRecord,
    "musicbrainzId" | "isrc" | "metadataFingerprint"
  >,
  fileIndex?: Pick<FileIndexRecord, "fullContentHash" | "contentHash">
): GlobalTrackIdentity {
  const metadataFingerprint = track.metadataFingerprint;
  if (track.musicbrainzId) {
    return {
      globalTrackId: `mbid:${track.musicbrainzId}`,
      globalTrackSource: "musicbrainz",
      globalTrackConfidence: 1.0,
      metadataFingerprint,
    };
  }
  if (track.isrc) {
    return {
      globalTrackId: `isrc:${track.isrc}`,
      globalTrackSource: "isrc",
      globalTrackConfidence: 0.95,
      metadataFingerprint,
    };
  }
  if (fileIndex?.fullContentHash) {
    return {
      globalTrackId: `sha256:${fileIndex.fullContentHash}`,
      globalTrackSource: "full-hash",
      globalTrackConfidence: 0.9,
      metadataFingerprint,
    };
  }
  if (fileIndex?.contentHash) {
    return {
      globalTrackId: `sha256-256k:${fileIndex.contentHash}`,
      globalTrackSource: "partial-hash",
      globalTrackConfidence: 0.7,
      metadataFingerprint,
    };
  }
  if (metadataFingerprint) {
    return {
      globalTrackId: `meta:${metadataFingerprint}`,
      globalTrackSource: "metadata",
      globalTrackConfidence: 0.5,
      metadataFingerprint,
    };
  }
  return { metadataFingerprint };
}

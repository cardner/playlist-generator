import {
  buildMetadataFingerprint,
  resolveGlobalTrackIdentity,
} from "@/features/library/track-identity-utils";

describe("track identity utils", () => {
  it("builds a metadata fingerprint from tags and duration", () => {
    const fingerprint = buildMetadataFingerprint(
      {
        title: "Song Title",
        artist: "The Artist",
        album: "The Album",
        genres: [],
      },
      { durationSeconds: 245 }
    );
    expect(fingerprint).toBeTruthy();
  });

  it("returns undefined when required tag fields are missing", () => {
    const fingerprint = buildMetadataFingerprint(
      {
        title: "",
        artist: "Artist",
        album: "Album",
        genres: [],
      },
      { durationSeconds: 245 }
    );
    expect(fingerprint).toBeUndefined();
  });

  it("prioritizes MusicBrainz ID over hashes", () => {
    const identity = resolveGlobalTrackIdentity(
      {
        musicbrainzId: "mbid-123",
        isrc: "USRC17607839",
        metadataFingerprint: "meta123",
      },
      {
        fullContentHash: "fullhash",
        contentHash: "partialhash",
      }
    );
    expect(identity.globalTrackId).toBe("mbid:mbid-123");
    expect(identity.globalTrackSource).toBe("musicbrainz");
  });

  it("falls back to full content hash, then metadata fingerprint", () => {
    const fromHash = resolveGlobalTrackIdentity(
      {
        metadataFingerprint: "meta456",
      },
      {
        fullContentHash: "fullhash",
      }
    );
    expect(fromHash.globalTrackId).toBe("sha256:fullhash");

    const fromMetadata = resolveGlobalTrackIdentity(
      {
        metadataFingerprint: "meta456",
      },
      {}
    );
    expect(fromMetadata.globalTrackId).toBe("meta:meta456");
  });
});

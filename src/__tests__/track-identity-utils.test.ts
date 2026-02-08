import {
  buildMetadataFingerprint,
  resolveGlobalTrackIdentity,
} from "@/features/library/track-identity-utils";

describe("track identity utils", () => {
  it("builds a metadata fingerprint from tags and duration", async () => {
    const fingerprint = await buildMetadataFingerprint(
      {
        title: "Song Title",
        artist: "The Artist",
        album: "The Album",
        genres: [],
      },
      { durationSeconds: 245 }
    );
    expect(fingerprint).toBeTruthy();
    expect(typeof fingerprint).toBe("string");
    // SHA-256 based fingerprint should be 14 characters (base64url of 10 bytes)
    expect(fingerprint?.length).toBe(14);
  });

  it("returns undefined when required tag fields are missing", async () => {
    const fingerprint = await buildMetadataFingerprint(
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

  it("produces consistent hashes for same input", async () => {
    const tags = {
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      genres: [],
    };
    const tech = { durationSeconds: 180 };
    
    const hash1 = await buildMetadataFingerprint(tags, tech);
    const hash2 = await buildMetadataFingerprint(tags, tech);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toBeTruthy();
  });

  it("produces different hashes for different inputs", async () => {
    const hash1 = await buildMetadataFingerprint(
      { title: "Song A", artist: "Artist", album: "", genres: [] },
      { durationSeconds: 180 }
    );
    const hash2 = await buildMetadataFingerprint(
      { title: "Song B", artist: "Artist", album: "", genres: [] },
      { durationSeconds: 180 }
    );
    
    expect(hash1).not.toBe(hash2);
    expect(hash1).toBeTruthy();
    expect(hash2).toBeTruthy();
  });
});

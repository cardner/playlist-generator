import { describe, expect, it } from "@jest/globals";
import { formatPlaylistFilenameStem } from "@/lib/playlist-filename";

describe("formatPlaylistFilenameStem", () => {
  it("keeps human-readable spacing and casing", () => {
    expect(formatPlaylistFilenameStem("Road Trip 2026")).toBe("Road Trip 2026");
  });

  it("replaces filesystem-unsafe separators with a readable dash", () => {
    expect(formatPlaylistFilenameStem("Rock/Pop: 90s * Hits?")).toBe(
      "Rock - Pop - 90s - Hits"
    );
  });

  it("normalizes accents to ASCII", () => {
    expect(formatPlaylistFilenameStem("Café Mélange")).toBe("Cafe Melange");
  });

  it("falls back to Playlist when input is empty", () => {
    expect(formatPlaylistFilenameStem("   ")).toBe("Playlist");
  });

  it("truncates long names to the requested length", () => {
    expect(formatPlaylistFilenameStem("A Very Long Playlist Name", 10)).toBe("A Very Lon");
  });
});

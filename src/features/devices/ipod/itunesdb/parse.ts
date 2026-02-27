/**
 * iTunesDB parser: binary buffer -> IpodDbModel.
 * Supports dbversions 0x09-0x19 with version-dependent mhbd/mhit header sizes.
 */

import type { IpodDbModel, IpodTrack, IpodPlaylist } from "../db-types";
import { normalizeToDbPath } from "../paths-db";
import {
  readChunkHeader,
  readChunkType,
  readU8,
  readU16LE,
  readU32LE,
  readU64LE,
  readUtf16LEString,
  readUtf16LEStringNullTerminated,
} from "./binary";

/** mhit header size by dbversion (wikiPodLinux); 0x75 = iTunes-compatible 5th/7th gen */
const MHIT_HEADER_SIZE: Record<number, number> = {
  0x09: 0x9c,
  0x0a: 0x9c,
  0x0b: 0x9c,
  0x0c: 0xf4,
  0x0d: 0xf4,
  0x0e: 0xf4,
  0x0f: 0xf4,
  0x10: 0xf4,
  0x11: 0xf4,
  0x12: 0x148,
  0x13: 0x148,
  0x14: 0x184,
  0x15: 0x184,
  0x16: 0x184,
  0x17: 0x184,
  0x18: 0x184,
  0x19: 0x184,
  0x75: 0x184,
};

function getMhitHeaderSize(dbversion: number): number {
  return MHIT_HEADER_SIZE[dbversion] ?? 0xf4;
}

/** mhod type values (wikiPodLinux) */
const MHOD_TITLE = 1;
const MHOD_LOCATION = 2;
const MHOD_ALBUM = 3;
const MHOD_ARTIST = 4;
const MHOD_GENRE = 5;
const MHOD_FILETYPE = 6;

/**
 * Parse mhod at data[offset]. Returns type and string value; advances offset past chunk.
 */
function parseMhod(
  data: Uint8Array,
  offset: number
): { type: number; value: string; nextOffset: number } {
  const h = readChunkHeader(data, offset);
  if (h.type !== "mhod") {
    return { type: 0, value: "", nextOffset: offset + (h.endOrChildCount || h.headerEnd) };
  }
  const chunkEnd = offset + h.endOrChildCount;
  const type = readU32LE(data, offset + 12);
  // mhod string: often 2-byte length (UTF-16 units) at 16, then UTF-16LE data
  let value = "";
  if (chunkEnd > offset + 18) {
    const lenUnits = readU16LE(data, offset + 16);
    if (lenUnits > 0 && offset + 18 + lenUnits * 2 <= chunkEnd) {
      value = readUtf16LEString(data, offset + 18, lenUnits);
    } else {
      const { value: v } = readUtf16LEStringNullTerminated(
        data,
        offset + 18,
        chunkEnd - (offset + 18)
      );
      value = v;
    }
  }
  return { type, value: value.replace(/\0+$/, "").trim(), nextOffset: chunkEnd };
}

/**
 * Parse one mhit (track) and its mhod children. data[offset] = start of mhit.
 */
function parseMhit(
  data: Uint8Array,
  offset: number,
  dbversion: number,
  trackIndex: number
): { track: IpodTrack; nextOffset: number } {
  const h = readChunkHeader(data, offset);
  if (h.type !== "mhit") {
    return {
      track: { id: trackIndex, title: "" },
      nextOffset: offset + h.endOrChildCount,
    };
  }
  const headerSize = getMhitHeaderSize(dbversion);
  const chunkEnd = offset + h.endOrChildCount;

  const id = readU32LE(data, offset + 16);
  const size = readU32LE(data, offset + 36);
  const lengthMs = readU32LE(data, offset + 40);
  const trackNr = readU32LE(data, offset + 44);
  const year = readU32LE(data, offset + 52);

  let title = "";
  let artist = "";
  let album = "";
  let genre = "";
  let filetype = "";
  let location = "";

  let pos = offset + headerSize;
  while (pos < chunkEnd - 12) {
    const type = readChunkType(data, pos);
    if (type !== "mhod") {
      pos += readU32LE(data, pos + 8) || headerSize;
      continue;
    }
    const mhod = parseMhod(data, pos);
    pos = mhod.nextOffset;
    switch (mhod.type) {
      case MHOD_TITLE:
        title = mhod.value;
        break;
      case MHOD_ARTIST:
        artist = mhod.value;
        break;
      case MHOD_ALBUM:
        album = mhod.value;
        break;
      case MHOD_GENRE:
        genre = mhod.value;
        break;
      case MHOD_FILETYPE:
        filetype = mhod.value;
        break;
      case MHOD_LOCATION:
        location = mhod.value;
        break;
      default:
        break;
    }
  }

  const track: IpodTrack = {
    id,
    title: title || undefined,
    artist: artist || undefined,
    album: album || undefined,
    genre: genre || undefined,
    track_nr: trackNr || undefined,
    year: year || undefined,
    size: size || undefined,
    tracklen: lengthMs || undefined,
    ipod_path: location ? normalizeToDbPath(location) : undefined,
  };
  return { track, nextOffset: chunkEnd };
}

/**
 * Parse mhlt (track list) and all mhit children.
 */
function parseMhlt(
  data: Uint8Array,
  offset: number,
  dbversion: number
): { tracks: IpodTrack[]; nextOffset: number } {
  const h = readChunkHeader(data, offset);
  if (h.type !== "mhlt") {
    return { tracks: [], nextOffset: offset + (h.endOrChildCount || h.headerEnd) };
  }
  const numSongs = h.endOrChildCount;
  const headerEnd = h.headerEnd;
  const tracks: IpodTrack[] = [];
  let pos = offset + headerEnd;
  for (let i = 0; i < numSongs && pos < data.length - 12; i++) {
    const sub = readChunkType(data, pos);
    if (sub === "mhit") {
      const { track, nextOffset } = parseMhit(data, pos, dbversion, i);
      tracks.push(track);
      pos = nextOffset;
    } else {
      const ch = readChunkHeader(data, pos);
      pos += ch.endOrChildCount || ch.headerEnd;
    }
  }
  return { tracks, nextOffset: pos };
}

/**
 * Parse mhip (playlist item) to get track ID. data[offset] = start of mhip.
 */
function parseMhip(data: Uint8Array, offset: number): { trackId: number; nextOffset: number } {
  const h = readChunkHeader(data, offset);
  const trackId = readU32LE(data, offset + 24);
  return { trackId, nextOffset: offset + h.endOrChildCount };
}

/**
 * Parse mhyp (playlist) and its mhod/mhip children.
 */
function parseMhyp(
  data: Uint8Array,
  offset: number
): { name: string; is_master: boolean; trackIds: number[]; nextOffset: number } {
  const h = readChunkHeader(data, offset);
  if (h.type !== "mhyp") {
    return { name: "", is_master: false, trackIds: [], nextOffset: offset + h.endOrChildCount };
  }
  const chunkEnd = offset + h.endOrChildCount;
  const dataObjectCount = readU32LE(data, offset + 12);
  const playlistItemCount = readU32LE(data, offset + 16);
  const isMaster = readU8(data, offset + 20) === 1;

  let name = "";
  const trackIds: number[] = [];
  let pos = offset + h.headerEnd;
  let mhodCount = 0;
  let mhipCount = 0;

  while (pos < chunkEnd - 12) {
    const type = readChunkType(data, pos);
    if (type === "mhod" && mhodCount < dataObjectCount) {
      const mhod = parseMhod(data, pos);
      mhodCount++;
      if (mhod.type === MHOD_TITLE) name = mhod.value;
      pos = mhod.nextOffset;
    } else if (type === "mhip") {
      const { trackId, nextOffset } = parseMhip(data, pos);
      mhipCount++;
      if (mhipCount <= playlistItemCount) trackIds.push(trackId);
      pos = nextOffset;
      // mhip can be followed by mhod type 100 (position); skip it
      if (pos < chunkEnd - 12 && readChunkType(data, pos) === "mhod") {
        const mh = readChunkHeader(data, pos);
        pos += mh.endOrChildCount || mh.headerEnd;
      }
    } else {
      const ch = readChunkHeader(data, pos);
      pos += ch.endOrChildCount || ch.headerEnd;
    }
  }

  return {
    name: name || "Playlist",
    is_master: isMaster,
    trackIds,
    nextOffset: chunkEnd,
  };
}

/**
 * Parse mhlp (playlist list) and all mhyp children.
 */
function parseMhlp(data: Uint8Array, offset: number): { playlists: IpodPlaylist[]; nextOffset: number } {
  const h = readChunkHeader(data, offset);
  if (h.type !== "mhlp") {
    return { playlists: [], nextOffset: offset + (h.endOrChildCount || h.headerEnd) };
  }
  const numPlaylists = h.endOrChildCount;
  const headerEnd = h.headerEnd;
  const playlists: IpodPlaylist[] = [];
  let pos = offset + headerEnd;
  for (let i = 0; i < numPlaylists && pos < data.length - 12; i++) {
    if (readChunkType(data, pos) === "mhyp") {
      const { name, is_master, trackIds, nextOffset } = parseMhyp(data, pos);
      playlists.push({ name, is_master, trackIds });
      pos = nextOffset;
    } else {
      const ch = readChunkHeader(data, pos);
      pos += ch.endOrChildCount || ch.headerEnd;
    }
  }
  return { playlists, nextOffset: pos };
}

/**
 * Parse iTunesDB buffer into IpodDbModel.
 */
export function parseITunesDB(data: Uint8Array): IpodDbModel {
  if (data.length < 24) {
    return { dbversion: 0x0b, tracks: [], playlists: [] };
  }

  const mhbdType = readChunkType(data, 0);
  if (mhbdType !== "mhbd") {
    throw new Error(`Expected mhbd at start, got ${mhbdType}`);
  }

  const headerEnd = readU32LE(data, 4);
  const dbversion = readU32LE(data, 16);
  const numChildren = readU32LE(data, 20);

  let tracks: IpodTrack[] = [];
  let playlists: IpodPlaylist[] = [];
  const mhsdBlobs: Record<number, Uint8Array> = {};

  let pos = headerEnd;
  const fileEnd = readU32LE(data, 8);

  for (let i = 0; i < numChildren && pos < fileEnd && pos < data.length - 12; i++) {
    const chunkType = readChunkType(data, pos);
    if (chunkType !== "mhsd") {
      const h = readChunkHeader(data, pos);
      pos += h.endOrChildCount || h.headerEnd;
      continue;
    }

    const mhsdHeaderEnd = readU32LE(data, pos + 4);
    const mhsdTotalLength = readU32LE(data, pos + 8);
    const mhsdType = readU32LE(data, pos + 12);
    const childStart = pos + mhsdHeaderEnd;

    if (mhsdType === 1 && childStart < data.length - 4) {
      if (readChunkType(data, childStart) === "mhlt") {
        const result = parseMhlt(data, childStart, dbversion);
        tracks = result.tracks;
      }
    } else if ((mhsdType === 2 || mhsdType === 3) && childStart < data.length - 4) {
      if (readChunkType(data, childStart) === "mhlp") {
        const result = parseMhlp(data, childStart);
        if (playlists.length === 0) {
          playlists = result.playlists;
        } else {
          playlists.push(...result.playlists);
        }
      }
    } else if (mhsdType === 4 || mhsdType === 5) {
      const blobEnd = pos + mhsdTotalLength;
      if (blobEnd <= data.length) {
        mhsdBlobs[mhsdType] = data.slice(childStart, blobEnd);
      }
    }

    pos += mhsdTotalLength;
  }

  return {
    dbversion,
    tracks,
    playlists,
    ...(Object.keys(mhsdBlobs).length > 0 ? { mhsdBlobs } : {}),
  };
}

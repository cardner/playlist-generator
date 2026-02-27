/**
 * iTunesDB serializer: IpodDbModel -> binary buffer.
 * Emits mhbd, mhsd (type 1 track list, type 2 playlist list), mhlt, mhit+mhod, mhlp, mhyp+mhip.
 *
 * Chunk layout (wikiPodLinux): type (4), headerEnd (4), endOrChildCount (4). For mhit, the
 * byte length of the chunk (including mhods) is at offset +8; offset +36 is track file size.
 * Parsers must use +8 for advancing to the next mhit; using +36 causes "Illegal seek" errors.
 */

import type { IpodDbModel, IpodTrack, IpodPlaylist } from "../db-types";
import { normalizeToDbPath } from "../paths-db";
import {
  writeChunkType,
  writeU8,
  writeU16LE,
  writeU32LE,
  writeU64LE,
  encodeUtf16LE,
} from "./binary";

const MHBD_HEADER_SIZE_LEGACY = 0x68;
const MHBD_HEADER_SIZE_EXTENDED = 0xf4;
const MHBD_HEADER_SIZE_NEW = 0xbc;

/**
 * Returns mhbd header size in bytes. Use 0xf4 for dbversion 0x75 (5th/7th gen iTunes-compatible).
 */
export function getMhbdHeaderSize(dbversion: number): number {
  if (dbversion === 0x75) return MHBD_HEADER_SIZE_EXTENDED;
  return dbversion >= 0x17 ? MHBD_HEADER_SIZE_NEW : MHBD_HEADER_SIZE_LEGACY;
}

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

const MHOD_TITLE = 1;
const MHOD_LOCATION = 2;
const MHOD_ALBUM = 3;
const MHOD_ARTIST = 4;
const MHOD_GENRE = 5;
const MHOD_FILETYPE = 6;

function mhodSize(str: string): number {
  const utf16 = encodeUtf16LE(str + "\0");
  return 12 + 4 + 2 + utf16.length;
}

function writeMhod(
  data: Uint8Array,
  offset: number,
  type: number,
  value: string
): number {
  const str = value || "";
  const utf16 = encodeUtf16LE(str + "\0");
  const lenUnits = (utf16.length / 2) | 0;
  const chunkLen = 12 + 4 + 2 + utf16.length;

  writeChunkType(data, offset, "mhod");
  writeU32LE(data, offset + 4, 18);
  writeU32LE(data, offset + 8, chunkLen);
  writeU32LE(data, offset + 12, type);
  writeU16LE(data, offset + 16, lenUnits);
  data.set(utf16, offset + 18);
  return offset + chunkLen;
}

function mhitSize(track: IpodTrack, dbversion: number, trackIndex: number): number {
  const headerSize = getMhitHeaderSize(dbversion);
  const location = normalizeToDbPath(
    track.ipod_path ?? `iPod_Control/Music/F00/track_${trackIndex}.mp3`
  );
  // Use same defaults as writeMhit so allocated size matches written size
  let body = mhodSize(location);
  body += mhodSize(track.title ?? "");
  body += mhodSize(track.artist ?? "Unknown Artist");
  body += mhodSize(track.album ?? "Unknown Album");
  body += mhodSize(track.genre ?? "");
  body += mhodSize("MPEG audio file");
  return headerSize + body;
}

function writeMhit(
  data: Uint8Array,
  offset: number,
  track: IpodTrack,
  dbversion: number,
  trackIndex: number,
  dbid: bigint
): number {
  const headerSize = getMhitHeaderSize(dbversion);
  const id = track.id ?? trackIndex;
  let pos = offset;
  writeChunkType(data, pos, "mhit");
  writeU32LE(data, pos + 4, headerSize);
  const chunkEnd = offset + mhitSize(track, dbversion, trackIndex);
  const mhitByteLength = chunkEnd - offset;
  writeU32LE(data, pos + 8, mhitByteLength);
  // Parsers must use offset +8 as the mhit chunk length (endOrChildCount). Offset +36 is
  // track file size in bytes; using it as chunk length causes "Illegal seek" in some WASM parsers.
  writeU32LE(data, pos + 12, 6);
  writeU32LE(data, pos + 16, id);
  writeU32LE(data, pos + 20, 1);
  writeU32LE(data, pos + 36, track.size ?? 0);
  writeU32LE(data, pos + 40, track.tracklen ?? 0);
  writeU32LE(data, pos + 44, track.track_nr ?? 0);
  writeU32LE(data, pos + 48, 0);
  writeU32LE(data, pos + 52, track.year ?? 0);
  writeU64LE(data, pos + 112, dbid);
  if (headerSize >= 0x184) {
    writeU8(data, pos + 164, 1);
    writeU16LE(data, pos + 124, 1);
  }
  pos = offset + headerSize;

  // Location mhod must be colon-separated (iPod format) for the device to resolve files.
  const location = normalizeToDbPath(
    track.ipod_path ?? `iPod_Control/Music/F00/track_${trackIndex}.mp3`
  );
  pos = writeMhod(data, pos, MHOD_LOCATION, location);
  pos = writeMhod(data, pos, MHOD_TITLE, track.title ?? "");
  pos = writeMhod(data, pos, MHOD_ARTIST, track.artist ?? "Unknown Artist");
  pos = writeMhod(data, pos, MHOD_ALBUM, track.album ?? "Unknown Album");
  pos = writeMhod(data, pos, MHOD_GENRE, track.genre ?? "");
  pos = writeMhod(data, pos, MHOD_FILETYPE, "MPEG audio file");
  return pos;
}

function mhltSize(tracks: IpodTrack[], dbversion: number): number {
  const mhltHeader = 12;
  let body = 0;
  for (let i = 0; i < tracks.length; i++) body += mhitSize(tracks[i], dbversion, i);
  return mhltHeader + body;
}

function writeMhlt(
  data: Uint8Array,
  offset: number,
  tracks: IpodTrack[],
  dbversion: number,
  startDbid: bigint
): number {
  let pos = offset;
  writeChunkType(data, pos, "mhlt");
  writeU32LE(data, pos + 4, 12);
  writeU32LE(data, pos + 8, tracks.length);
  pos += 12;
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const id = track.id ?? i;
    pos = writeMhit(data, pos, { ...track, id }, dbversion, i, startDbid + BigInt(i));
  }
  return pos;
}

const MHYP_HEADER_SIZE = 48;

function mhipSize(): number {
  return 36;
}

function mhypSize(pl: IpodPlaylist): number {
  let size = MHYP_HEADER_SIZE;
  size += mhodSize(pl.name);
  size += pl.trackIds.length * (mhipSize() + 20);
  return size;
}

function writeMhip(data: Uint8Array, offset: number, trackId: number): number {
  writeChunkType(data, offset, "mhip");
  writeU32LE(data, offset + 4, 36);
  writeU32LE(data, offset + 8, 36);
  writeU32LE(data, offset + 12, 0);
  writeU16LE(data, offset + 16, 0);
  writeU32LE(data, offset + 24, trackId);
  writeU32LE(data, offset + 28, 0);
  return offset + 36;
}

function writeMhyp(data: Uint8Array, offset: number, pl: IpodPlaylist): number {
  let pos = offset;
  const chunkLen = mhypSize(pl);
  writeChunkType(data, pos, "mhyp");
  writeU32LE(data, pos + 4, MHYP_HEADER_SIZE);
  writeU32LE(data, pos + 8, chunkLen);
  writeU32LE(data, pos + 12, 1);
  writeU32LE(data, pos + 16, pl.trackIds.length);
  writeU8(data, pos + 20, pl.is_master ? 1 : 0);
  pos += MHYP_HEADER_SIZE;
  pos = writeMhod(data, pos, MHOD_TITLE, pl.name);
  for (const trackId of pl.trackIds) {
    pos = writeMhip(data, pos, trackId);
    writeChunkType(data, pos, "mhod");
    writeU32LE(data, pos + 4, 18);
    writeU32LE(data, pos + 8, 20);
    writeU32LE(data, pos + 12, 100);
    writeU16LE(data, pos + 16, 0);
    pos += 20;
  }
  return pos;
}

function mhlpSize(playlists: IpodPlaylist[]): number {
  const mhlpHeader = 12;
  let body = 0;
  for (const pl of playlists) body += mhypSize(pl);
  return mhlpHeader + body;
}

function writeMhlp(data: Uint8Array, offset: number, playlists: IpodPlaylist[]): number {
  let pos = offset;
  writeChunkType(data, pos, "mhlp");
  writeU32LE(data, pos + 4, 12);
  writeU32LE(data, pos + 8, playlists.length);
  pos += 12;
  for (const pl of playlists) {
    pos = writeMhyp(data, pos, pl);
  }
  return pos;
}

const MHSD_HEADER_SIZE = 0x18;

export function serializeITunesDB(
  model: IpodDbModel,
  options?: { syncTimestamp?: number | bigint }
): Uint8Array {
  const dbversion = model.dbversion || 0x0b;
  const syncTimestamp =
    options?.syncTimestamp !== undefined
      ? BigInt(options.syncTimestamp)
      : BigInt(Math.floor(Date.now() / 1000));
  const tracks = model.tracks ?? [];
  let playlists = model.playlists ?? [];
  if (playlists.length === 0 && tracks.length > 0) {
    playlists = [
      {
        name: "Library",
        is_master: true,
        trackIds: tracks.map((_, i) => tracks[i].id ?? i),
      },
    ];
  } else if (playlists.length === 0) {
    playlists = [{ name: "Library", is_master: true, trackIds: [] }];
  }

  // Ensure master (Library) playlist is first and contains all track IDs
  const allTrackIds = new Set(tracks.map((t, i) => t.id ?? i));
  const masterIndex = playlists.findIndex((p) => p.is_master);
  let master = masterIndex >= 0 ? playlists[masterIndex] : null;
  if (!master) {
    master = { name: "Library", is_master: true, trackIds: [] };
    playlists = [master, ...playlists];
  } else if (masterIndex > 0) {
    playlists = [
      master,
      ...playlists.slice(0, masterIndex),
      ...playlists.slice(masterIndex + 1),
    ];
  }
  master!.trackIds = [...new Set([...master!.trackIds, ...allTrackIds])];

  const mhbdHeaderSize = getMhbdHeaderSize(dbversion);
  const mhltLen = mhltSize(tracks, dbversion);
  const mhsd1Len = MHSD_HEADER_SIZE + mhltLen;
  const mhlpLen = mhlpSize(playlists);
  const mhsd2Len = MHSD_HEADER_SIZE + mhlpLen;
  const mhsdBlobs = model.mhsdBlobs ?? {};
  const mhsd3Len =
    MHSD_HEADER_SIZE + (mhsdBlobs[3]?.length ?? 0);
  const mhsd4Len =
    MHSD_HEADER_SIZE + (mhsdBlobs[4]?.length ?? 0);
  const mhsd5Len =
    MHSD_HEADER_SIZE + (mhsdBlobs[5]?.length ?? 0);
  const fileLen =
    mhbdHeaderSize + mhsd1Len + mhsd2Len + mhsd3Len + mhsd4Len + mhsd5Len;

  const data = new Uint8Array(fileLen);
  let pos = 0;

  writeChunkType(data, pos, "mhbd");
  writeU32LE(data, pos + 4, mhbdHeaderSize);
  writeU32LE(data, pos + 8, fileLen);
  writeU32LE(data, pos + 12, 1);
  writeU32LE(data, pos + 16, dbversion);
  writeU32LE(data, pos + 20, 5);
  writeU64LE(data, 0x18, syncTimestamp);
  if (fileLen !== data.length) {
    throw new Error(
      `iTunesDB length mismatch: computed fileLen ${fileLen} != buffer length ${data.length}`
    );
  }
  pos = mhbdHeaderSize;

  writeChunkType(data, pos, "mhsd");
  writeU32LE(data, pos + 4, MHSD_HEADER_SIZE);
  writeU32LE(data, pos + 8, mhsd1Len);
  writeU32LE(data, pos + 12, 1);
  pos += MHSD_HEADER_SIZE;
  pos = writeMhlt(data, pos, tracks, dbversion, 1n);

  writeChunkType(data, pos, "mhsd");
  writeU32LE(data, pos + 4, MHSD_HEADER_SIZE);
  writeU32LE(data, pos + 8, mhsd2Len);
  writeU32LE(data, pos + 12, 2);
  pos += MHSD_HEADER_SIZE;
  pos = writeMhlp(data, pos, playlists);

  for (let mhsdType = 3; mhsdType <= 5; mhsdType++) {
    const blob = mhsdBlobs[mhsdType];
    const mhsdLen = MHSD_HEADER_SIZE + (blob?.length ?? 0);
    writeChunkType(data, pos, "mhsd");
    writeU32LE(data, pos + 4, MHSD_HEADER_SIZE);
    writeU32LE(data, pos + 8, mhsdLen);
    writeU32LE(data, pos + 12, mhsdType);
    pos += MHSD_HEADER_SIZE;
    if (blob && blob.length > 0) {
      data.set(blob, pos);
      pos += blob.length;
    }
  }

  return data;
}

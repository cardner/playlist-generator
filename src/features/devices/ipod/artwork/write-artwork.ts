/**
 * ArtworkDB and ITHMB write path.
 * ArtworkDB uses similar chunk structure to iTunesDB (mhbd, mhsd, mhii for image index).
 * ITHMB files (e.g. F0000_0.ithmb) contain thumbnail image blobs (JPEG).
 * Layout follows reverse-engineered formats from libgpod/gtkpod and device dumps.
 */

import type { IpodDbModel, IpodTrackArtwork } from "../db-types";
import { writeChunkType, writeU32LE, writeU64LE } from "../itunesdb/binary";

export type WriteArtworkResult = {
  ArtworkDB?: Uint8Array;
  ITHMB?: Map<string, Uint8Array>;
};

const ARTWORK_MHBD_HEADER_SIZE = 0x68;
const ARTWORK_MHSD_HEADER_SIZE = 0x18;
const MHIA_CHUNK_SIZE = 36;
const MHII_HEADER_SIZE = 12;

/** Build ITHMB buffer: 8-byte magic "iThmb\0\0\0", uint32 count, then per image: uint32 length + JPEG data. Returns buffer and array of { offset, size } for each image (offset = start of JPEG data in file). */
function buildITHMB(entries: IpodTrackArtwork[]): { buffer: Uint8Array; offsets: { offset: number; size: number }[] } {
  const magic = new TextEncoder().encode("iThmb\0\0\0");
  const offsets: { offset: number; size: number }[] = [];
  let total = 8 + 4;
  for (const e of entries) {
    total += 4 + (e.jpegBytes?.length ?? 0);
  }
  const buffer = new Uint8Array(total);
  buffer.set(magic, 0);
  writeU32LE(buffer, 8, entries.length);
  let pos = 12;
  for (const e of entries) {
    const len = e.jpegBytes?.length ?? 0;
    writeU32LE(buffer, pos, len);
    pos += 4;
    offsets.push({ offset: pos, size: len });
    if (e.jpegBytes && len > 0) buffer.set(e.jpegBytes, pos);
    pos += len;
  }
  return { buffer, offsets };
}

/** Build ArtworkDB buffer: mhbd, mhsd, mhii (child count = N), then N × mhia (dbid, offset, size). */
function buildArtworkDB(
  entries: IpodTrackArtwork[],
  ithmbOffsets: { offset: number; size: number }[]
): Uint8Array {
  const n = entries.length;
  const mhiiBody = n * MHIA_CHUNK_SIZE;
  const mhiiLen = MHII_HEADER_SIZE + mhiiBody;
  const mhsdLen = ARTWORK_MHSD_HEADER_SIZE + mhiiLen;
  const fileLen = ARTWORK_MHBD_HEADER_SIZE + mhsdLen;
  const data = new Uint8Array(fileLen);
  let pos = 0;

  writeChunkType(data, pos, "mhbd");
  writeU32LE(data, pos + 4, ARTWORK_MHBD_HEADER_SIZE);
  writeU32LE(data, pos + 8, fileLen);
  writeU32LE(data, pos + 12, 1);
  writeU32LE(data, pos + 16, 0x0b);
  writeU32LE(data, pos + 20, 1);
  pos = ARTWORK_MHBD_HEADER_SIZE;

  writeChunkType(data, pos, "mhsd");
  writeU32LE(data, pos + 4, ARTWORK_MHSD_HEADER_SIZE);
  writeU32LE(data, pos + 8, mhsdLen);
  writeU32LE(data, pos + 12, 1);
  pos += ARTWORK_MHSD_HEADER_SIZE;

  writeChunkType(data, pos, "mhii");
  writeU32LE(data, pos + 4, MHII_HEADER_SIZE);
  writeU32LE(data, pos + 8, n);
  pos += MHII_HEADER_SIZE;

  for (let i = 0; i < n; i++) {
    const entry = entries[i];
    const dbid = entry.dbid ?? 1n + BigInt(entry.trackIndex);
    const { offset, size } = ithmbOffsets[i] ?? { offset: 0, size: 0 };
    writeChunkType(data, pos, "mhia");
    writeU32LE(data, pos + 4, 24);
    writeU32LE(data, pos + 8, MHIA_CHUNK_SIZE);
    writeU64LE(data, pos + 12, dbid);
    writeU32LE(data, pos + 20, offset);
    writeU32LE(data, pos + 24, size);
    writeU32LE(data, pos + 28, 0);
    pos += MHIA_CHUNK_SIZE;
  }
  return data;
}

/**
 * Serialize model's artwork state to ArtworkDB and ITHMB buffers.
 * When model.artwork is empty or not set, returns empty result.
 * Entries are written in trackIndex order; dbid is 1 + trackIndex if not set.
 */
export function writeArtwork(model: IpodDbModel): WriteArtworkResult {
  const artwork = model.artwork;
  if (!artwork || artwork.length === 0) {
    return {};
  }
  const entries = [...artwork].sort((a, b) => a.trackIndex - b.trackIndex);
  const { buffer: ithmbBuffer, offsets } = buildITHMB(entries);
  const ArtworkDB = buildArtworkDB(entries, offsets);
  const ITHMB = new Map<string, Uint8Array>([["F0000_0.ithmb", ithmbBuffer]]);
  return { ArtworkDB, ITHMB };
}

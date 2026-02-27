/**
 * ArtworkDB and ITHMB write path.
 * ArtworkDB uses similar chunk structure to iTunesDB (mhbd, mhsd, mhii for image index).
 * ITHMB files use working-device naming: F<index>_1.ithmb (e.g. F0000_1.ithmb, F1028_1.ithmb).
 * One ITHMB file per track with artwork. Layout follows libgpod/device dumps.
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

/** Build one ITHMB buffer for a single image: magic, count=1, length, JPEG. Returns buffer and { offset, size } of JPEG in file. */
function buildSingleImageITHMB(entry: IpodTrackArtwork): { buffer: Uint8Array; offset: number; size: number } {
  const magic = new TextEncoder().encode("iThmb\0\0\0");
  const jpegLen = entry.jpegBytes?.length ?? 0;
  const total = 8 + 4 + 4 + jpegLen;
  const buffer = new Uint8Array(total);
  buffer.set(magic, 0);
  writeU32LE(buffer, 8, 1);
  writeU32LE(buffer, 12, jpegLen);
  const offset = 16;
  if (entry.jpegBytes && jpegLen > 0) buffer.set(entry.jpegBytes, offset);
  return { buffer, offset, size: jpegLen };
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
 * Uses F<index>_1.ithmb naming (e.g. F0000_1.ithmb, F1028_1.ithmb), one file per track with artwork.
 * When model.artwork is empty or not set, returns empty result.
 */
export function writeArtwork(model: IpodDbModel): WriteArtworkResult {
  const artwork = model.artwork;
  if (!artwork || artwork.length === 0) {
    return {};
  }
  const entries = [...artwork].sort((a, b) => a.trackIndex - b.trackIndex);
  const offsets: { offset: number; size: number }[] = [];
  const ITHMB = new Map<string, Uint8Array>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { buffer, offset, size } = buildSingleImageITHMB(entry);
    const name = `F${String(i).padStart(4, "0")}_1.ithmb`;
    ITHMB.set(name, buffer);
    offsets.push({ offset, size });
  }
  const ArtworkDB = buildArtworkDB(entries, offsets);
  return { ArtworkDB, ITHMB };
}

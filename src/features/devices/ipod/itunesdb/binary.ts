/**
 * Little-endian binary read/write helpers for iTunesDB and related formats.
 * iTunesDB is little-endian (wikiPodLinux).
 */

export function readU8(data: Uint8Array, offset: number): number {
  return data[offset] ?? 0;
}

export function readU16LE(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

export function readU32LE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] ?? 0) |
    ((data[offset + 1] ?? 0) << 8) |
    ((data[offset + 2] ?? 0) << 16) |
    ((data[offset + 3] ?? 0) << 24)
  );
}

export function readU64LE(data: Uint8Array, offset: number): bigint {
  const lo = readU32LE(data, offset);
  const hi = readU32LE(data, offset + 4);
  return (BigInt(hi) << 32n) | BigInt(lo >>> 0);
}

export function writeU8(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
}

export function writeU16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

export function writeU32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

export function writeU64LE(data: Uint8Array, offset: number, value: bigint): void {
  writeU32LE(data, offset, Number(value & 0xffffffffn));
  writeU32LE(data, offset + 4, Number((value >> 32n) & 0xffffffffn));
}

/**
 * Read a 4-byte chunk type (e.g. "mhbd", "mhlt") as ASCII string.
 */
export function readChunkType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset] ?? 0,
    data[offset + 1] ?? 0,
    data[offset + 2] ?? 0,
    data[offset + 3] ?? 0
  );
}

/**
 * Write a 4-byte chunk type (ASCII).
 */
export function writeChunkType(data: Uint8Array, offset: number, type: string): void {
  const a = type.charCodeAt(0) & 0xff;
  const b = type.charCodeAt(1) & 0xff;
  const c = type.charCodeAt(2) & 0xff;
  const d = type.charCodeAt(3) & 0xff;
  data[offset] = a;
  data[offset + 1] = b;
  data[offset + 2] = c;
  data[offset + 3] = d;
}

/**
 * mhod string encoding: iTunesDB often uses UTF-16LE with 2-byte length prefix (number of
 * 16-bit units) or null-terminated. This reads a length-prefixed UTF-16LE string (length in
 * 16-bit units, then data). If length is 0, returns "".
 */
export function readUtf16LEString(
  data: Uint8Array,
  offset: number,
  lengthInUnits: number
): string {
  if (lengthInUnits <= 0) return "";
  const byteLength = lengthInUnits * 2;
  const end = offset + byteLength;
  const chars: number[] = [];
  for (let i = offset; i < end && i + 1 < data.length; i += 2) {
    const code = readU16LE(data, i);
    if (code === 0) break;
    chars.push(code);
  }
  return String.fromCharCode(...chars);
}

/**
 * Read null-terminated UTF-16LE string (2-byte null).
 */
export function readUtf16LEStringNullTerminated(
  data: Uint8Array,
  offset: number,
  maxBytes: number
): { value: string; bytesRead: number } {
  const chars: number[] = [];
  let i = offset;
  const end = Math.min(offset + maxBytes, data.length - 1);
  while (i < end) {
    const code = readU16LE(data, i);
    if (code === 0) {
      i += 2;
      break;
    }
    chars.push(code);
    i += 2;
  }
  return { value: String.fromCharCode(...chars), bytesRead: i - offset };
}

/**
 * Encode string to UTF-16LE (no BOM). Pads to even length with null if needed.
 */
export function encodeUtf16LE(str: string): Uint8Array {
  const buf = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    writeU16LE(buf, i * 2, c);
  }
  return buf;
}

/** Result of walking one chunk header (offset 0 = start of this chunk) */
export type ChunkHeader = {
  /** 4-char type e.g. "mhbd" */
  type: string;
  /** Offset (from chunk start) where type-specific header ends (header length in bytes from start) */
  headerEnd: number;
  /** Either end offset of this chunk (incl. children) or number of top-level children (for mhlt/mhlp) */
  endOrChildCount: number;
  /** Total length in bytes of this chunk (header + body); for non-list chunks this is endOrChildCount */
  totalLength: number;
};

/**
 * Chunk encoding (wikiPodLinux): at offset 0: 4-byte type, 4-byte header end (LE), 4-byte end of chunk or child count (LE).
 * Returns header; all offsets relative to chunk start (offset passed in).
 */
export function readChunkHeader(data: Uint8Array, chunkStart: number): ChunkHeader {
  const type = readChunkType(data, chunkStart);
  const headerEnd = readU32LE(data, chunkStart + 4);
  const endOrChildCount = readU32LE(data, chunkStart + 8);
  return {
    type,
    headerEnd,
    endOrChildCount,
    totalLength: headerEnd,
  };
}

/**
 * For chunks that use endOrChildCount as "end of chunk" (e.g. mhbd, mhit), total byte length
 * of the chunk (including children) is endOrChildCount. For mhlt/mhlp it's the number of children.
 * This returns the byte length of the current chunk when it's used as end offset.
 */
export function getChunkTotalBytes(header: ChunkHeader, useEndAsByteLength: boolean): number {
  if (useEndAsByteLength) return header.endOrChildCount;
  return header.headerEnd;
}

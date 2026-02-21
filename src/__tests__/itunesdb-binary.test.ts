/**
 * Unit tests for iTunesDB binary helpers and chunk walker.
 */

import {
  readU8,
  readU16LE,
  readU32LE,
  readU64LE,
  writeU8,
  writeU16LE,
  writeU32LE,
  writeU64LE,
  readChunkType,
  writeChunkType,
  readChunkHeader,
  readUtf16LEString,
  encodeUtf16LE,
  readUtf16LEStringNullTerminated,
} from "@/features/devices/ipod/itunesdb/binary";

describe("itunesdb/binary", () => {
  describe("read/write LE integers", () => {
    it("reads and writes U8", () => {
      const buf = new Uint8Array(4);
      writeU8(buf, 0, 0x12);
      writeU8(buf, 1, 0xff);
      expect(readU8(buf, 0)).toBe(0x12);
      expect(readU8(buf, 1)).toBe(0xff);
    });

    it("reads and writes U16LE", () => {
      const buf = new Uint8Array(4);
      writeU16LE(buf, 0, 0x1234);
      expect(readU16LE(buf, 0)).toBe(0x1234);
    });

    it("reads and writes U32LE", () => {
      const buf = new Uint8Array(8);
      writeU32LE(buf, 0, 0x12345678);
      expect(readU32LE(buf, 0)).toBe(0x12345678);
    });

    it("reads and writes U64LE", () => {
      const buf = new Uint8Array(12);
      writeU64LE(buf, 0, 0x123456789abcdef0n);
      expect(readU64LE(buf, 0)).toBe(0x123456789abcdef0n);
    });
  });

  describe("chunk type", () => {
    it("reads and writes 4-char chunk type", () => {
      const buf = new Uint8Array(8);
      writeChunkType(buf, 0, "mhbd");
      expect(readChunkType(buf, 0)).toBe("mhbd");
      writeChunkType(buf, 4, "mhlt");
      expect(readChunkType(buf, 4)).toBe("mhlt");
    });
  });

  describe("chunk walker", () => {
    it("parses mhbd header from minimal iTunesDB-like buffer", () => {
      // Minimal mhbd: type "mhbd", header end 0x68, total chunk end 0x68 (104 bytes)
      const buf = new Uint8Array(0x68);
      buf.set([0x6d, 0x68, 0x62, 0x64], 0); // "mhbd"
      buf[4] = 0x68;
      buf[5] = 0;
      buf[6] = 0;
      buf[7] = 0;
      buf[8] = 0x68;
      buf[9] = 0;
      buf[10] = 0;
      buf[11] = 0;

      const header = readChunkHeader(buf, 0);
      expect(header.type).toBe("mhbd");
      expect(header.headerEnd).toBe(0x68);
      expect(header.endOrChildCount).toBe(0x68);
    });

    it("parses chunk header at offset", () => {
      const buf = new Uint8Array(24);
      buf.set([0x6d, 0x68, 0x6c, 0x74], 12); // "mhlt"
      buf[16] = 0x10;
      buf[20] = 3;
      buf[21] = 0; // 3 children (tracks)

      const header = readChunkHeader(buf, 12);
      expect(header.type).toBe("mhlt");
      expect(header.headerEnd).toBe(0x10);
      expect(header.endOrChildCount).toBe(3);
    });
  });

  describe("UTF-16LE strings", () => {
    it("encodes and reads UTF-16LE string", () => {
      const encoded = encodeUtf16LE("Hi");
      expect(encoded.length).toBe(4);
      expect(readUtf16LEString(encoded, 0, 2)).toBe("Hi");
    });

    it("reads null-terminated UTF-16LE", () => {
      const encoded = encodeUtf16LE("AB");
      const withNull = new Uint8Array(encoded.length + 2);
      withNull.set(encoded);
      const { value, bytesRead } = readUtf16LEStringNullTerminated(withNull, 0, 20);
      expect(value).toBe("AB");
      expect(bytesRead).toBe(6);
    });
  });
});

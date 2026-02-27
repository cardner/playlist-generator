/**
 * Unit tests for iPod sync safety: re-read from device, abort on empty parse.
 */

import { writeChunkType, writeU32LE } from "@/features/devices/ipod/itunesdb/binary";
import { syncPlaylistsToIpod } from "@/features/devices/ipod/sync";

const mockGetDirectoryHandle = jest.fn();
const mockVerifyIpodStructure = jest.fn();
const mockReadIpodBuffersFromHandle = jest.fn();

jest.mock("@/lib/library-selection-fs-api", () => ({
  getDirectoryHandle: (...args: unknown[]) => mockGetDirectoryHandle(...args),
}));

jest.mock("@/features/devices/ipod/fs-sync", () => ({
  verifyIpodStructure: (...args: unknown[]) => mockVerifyIpodStructure(...args),
  readIpodBuffersFromHandle: (...args: unknown[]) => mockReadIpodBuffersFromHandle(...args),
  syncDbToIpodFromBuffers: jest.fn(async () => ({ ok: true, errorCount: 0, syncedCount: 1 })),
  writeFileToIpodRelativePath: jest.fn(async () => {}),
  deleteFileFromIpodRelativePath: jest.fn(async () => {}),
  reserveVirtualPath: jest.fn(),
  setupWasmFilesystem: jest.fn(async () => {}),
}));

jest.mock("@/features/devices/device-storage", () => ({
  getDeviceTrackMappings: jest.fn(async () => []),
  saveDeviceTrackMapping: jest.fn(async () => {}),
  saveDeviceFileIndexEntries: jest.fn(async () => {}),
}));

jest.mock("@/db/storage", () => ({
  getLibraryRoot: jest.fn(async (id: string) =>
    id ? { id, handleRef: `handle-${id}`, mode: "handle" as const } : undefined
  ),
}));

jest.mock("@/features/devices/ipod/wasm", () => ({
  initIpodWasm: jest.fn(async () => true),
  isIpodWasmReady: jest.fn(() => false),
  wasmCallWithError: jest.fn(() => 0),
  wasmCall: jest.fn(),
  wasmCallWithStrings: jest.fn(),
  wasmGetJson: jest.fn(() => []),
  wasmGetString: jest.fn(() => ""),
  wasmAddTrack: jest.fn(),
  wasmUpdateTrack: jest.fn(),
  wasmSetTrackArtwork: jest.fn(),
  wasmDeviceSupportsArtwork: jest.fn(() => false),
  wasmFinalizeLastTrackNoStat: jest.fn(),
}));

jest.mock("@/features/devices/ipod/transcode", () => ({
  createTranscodePool: () => ({
    init: jest.fn(async () => true),
    transcodeToAac: jest.fn(async () => new Uint8Array(0)),
    destroy: jest.fn(),
  }),
}));

jest.mock("@/features/devices/ipod/ipod-db-api", () => ({
  ...jest.requireActual("@/features/devices/ipod/ipod-db-api"),
  getUseIpodTsBackend: jest.fn(() => true),
}));

describe("iPod sync safety", () => {
  const fakeHandle = {};
  const deviceProfile = {
    id: "dev-1",
    label: "iPod",
    deviceType: "ipod" as const,
    handleRef: "handle-ref-1",
    usbProductId: 0x1200,
  };
  const targets = [
    {
      playlist: { id: "pl-1", title: "Test", trackFileIds: [] },
      libraryRootId: "root-1",
      trackFileIds: [] as string[],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDirectoryHandle.mockResolvedValue(fakeHandle);
    mockVerifyIpodStructure.mockResolvedValue(true);
  });

  it("calls readIpodBuffersFromHandle at sync start when using TS backend", async () => {
    mockReadIpodBuffersFromHandle.mockRejectedValue(new Error("read called"));
    await expect(
      syncPlaylistsToIpod({ deviceProfile, targets })
    ).rejects.toThrow("read called");
    expect(mockReadIpodBuffersFromHandle).toHaveBeenCalledWith(fakeHandle);
  });

  it("aborts with clear error when parsed model is empty but raw buffer size > 256", async () => {
    const buf = new Uint8Array(257);
    writeChunkType(buf, 0, "mhbd");
    writeU32LE(buf, 4, 0x68);
    writeU32LE(buf, 8, 257);
    writeU32LE(buf, 12, 1);
    writeU32LE(buf, 16, 0x0b);
    writeU32LE(buf, 20, 0);
    mockReadIpodBuffersFromHandle.mockResolvedValue({
      iTunesDB: buf,
      SysInfo: undefined,
    });

    await expect(
      syncPlaylistsToIpod({ deviceProfile, targets })
    ).rejects.toThrow("Could not read existing iPod database; sync aborted to avoid data loss.");
  });
});

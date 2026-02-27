/**
 * Unit tests for device scan meta (saveDeviceScanMeta, getDeviceScanMeta, clearDeviceScanMeta).
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockPut = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn().mockResolvedValue(undefined);
const mockDelete = jest.fn().mockResolvedValue(undefined);

jest.mock("@/db/schema", () => ({
  db: {
    deviceScanMeta: {
      put: (...args: unknown[]) => mockPut(...args),
      get: (id: string) => mockGet(id),
      where: (_key: string) => ({
        equals: (value: string) => ({
          delete: () => mockDelete(value),
        }),
      }),
    },
  },
}));

describe("device scan meta", () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockGet.mockClear();
    mockDelete.mockClear();
  });

  it("saveDeviceScanMeta builds record and puts it", async () => {
    const { saveDeviceScanMeta } = await import("@/features/devices/device-storage");

    const record = await saveDeviceScanMeta("device-1", {
      scanRoots: "/Volumes/USB,/Volumes/USB/MUSIC",
      scannedAt: 1700000000000,
    });

    expect(record).toMatchObject({
      deviceId: "device-1",
      scanRoots: "/Volumes/USB,/Volumes/USB/MUSIC",
      scannedAt: 1700000000000,
    });
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(record);
  });

  it("getDeviceScanMeta returns record when present", async () => {
    const { getDeviceScanMeta } = await import("@/features/devices/device-storage");

    const meta = {
      deviceId: "device-2",
      scanRoots: "/Volumes/Walkman",
      scannedAt: 1700000001000,
    };
    mockGet.mockResolvedValue(meta);

    const result = await getDeviceScanMeta("device-2");

    expect(mockGet).toHaveBeenCalledWith("device-2");
    expect(result).toEqual(meta);
  });

  it("getDeviceScanMeta returns undefined when missing", async () => {
    const { getDeviceScanMeta } = await import("@/features/devices/device-storage");

    mockGet.mockResolvedValue(undefined);

    const result = await getDeviceScanMeta("device-3");

    expect(result).toBeUndefined();
  });

  it("clearDeviceScanMeta deletes by deviceId", async () => {
    const { clearDeviceScanMeta } = await import("@/features/devices/device-storage");

    await clearDeviceScanMeta("device-x");

    expect(mockDelete).toHaveBeenCalledWith("device-x");
  });
});

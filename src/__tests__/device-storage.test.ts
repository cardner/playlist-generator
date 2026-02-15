/**
 * Tests for device storage (profiles, mappings).
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { DeviceTrackMappingRecord } from "@/db/schema";

const mockPut = jest.fn().mockResolvedValue(undefined);
const mockToArray = jest.fn().mockResolvedValue([]);
const mockDelete = jest.fn().mockResolvedValue(undefined);

jest.mock("@/db/schema", () => ({
  db: {
    deviceTrackMappings: {
      put: (...args: unknown[]) => mockPut(...args),
      where: (_key: string) => ({
        equals: (value: string) => ({
          toArray: () => mockToArray(value),
          delete: () => mockDelete(value),
        }),
      }),
    },
  },
}));

describe("device track mappings", () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockToArray.mockClear();
    mockDelete.mockClear();
  });

  it("saveDeviceTrackMapping builds correct record and puts it", async () => {
    const {
      saveDeviceTrackMapping,
    } = await import("@/features/devices/device-storage");

    const record = await saveDeviceTrackMapping(
      "device-1",
      "file1-root1",
      42,
      "acoustid-abc"
    );

    expect(record).toMatchObject({
      id: "device-1-file1-root1",
      deviceId: "device-1",
      libraryTrackId: "file1-root1",
      deviceTrackId: 42,
      acoustidId: "acoustid-abc",
    });
    expect(record.updatedAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(record);
  });

  it("saveDeviceTrackMapping works without acoustidId", async () => {
    const {
      saveDeviceTrackMapping,
    } = await import("@/features/devices/device-storage");

    const record = await saveDeviceTrackMapping("device-2", "file2-root2", 99);

    expect(record.deviceTrackId).toBe(99);
    expect(record.acoustidId).toBeUndefined();
    expect(mockPut).toHaveBeenCalledWith(record);
  });

  it("getDeviceTrackMappings returns records for deviceId", async () => {
    const {
      getDeviceTrackMappings,
    } = await import("@/features/devices/device-storage");

    const fakeRecords: DeviceTrackMappingRecord[] = [
      {
        id: "dev-a-lib1",
        deviceId: "dev-a",
        libraryTrackId: "lib1",
        deviceTrackId: 1,
        updatedAt: 1000,
      },
    ];
    mockToArray.mockResolvedValue(fakeRecords);

    const result = await getDeviceTrackMappings("dev-a");

    expect(mockToArray).toHaveBeenCalled();
    expect(result).toEqual(fakeRecords);
  });

  it("clearDeviceTrackMappings deletes by deviceId", async () => {
    const {
      clearDeviceTrackMappings,
    } = await import("@/features/devices/device-storage");

    await clearDeviceTrackMappings("device-x");

    expect(mockDelete).toHaveBeenCalledWith("device-x");
  });
});

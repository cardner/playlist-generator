/**
 * Unit tests for device-detect module.
 */

import { describe, it, expect, jest } from "@jest/globals";

const mockVerifyIpodStructure = jest.fn();
jest.mock("@/features/devices/ipod", () => ({
  verifyIpodStructure: (...args: unknown[]) => mockVerifyIpodStructure(...args),
}));

import { detectDevicePreset } from "@/features/devices/device-detect";

describe("device-detect", () => {
  describe("detectDevicePreset", () => {
    it("returns rockbox when .rockbox directory exists", async () => {
      mockVerifyIpodStructure.mockResolvedValue(false);
      const handle = {
        name: "SDCARD",
        getDirectoryHandle: jest.fn().mockImplementation((name: string) => {
          if (name === ".rockbox") return Promise.resolve({});
          return Promise.reject(new Error("not found"));
        }),
      } as unknown as FileSystemDirectoryHandle;
      const result = await detectDevicePreset(handle);
      expect(result).toBe("rockbox");
      expect(handle.getDirectoryHandle).toHaveBeenCalledWith(".rockbox");
    });

    it("returns walkman when .rockbox missing but name contains walkman", async () => {
      mockVerifyIpodStructure.mockResolvedValue(false);
      const handle = {
        name: "WALKMAN",
        getDirectoryHandle: jest.fn().mockRejectedValue(new Error("not found")),
      } as unknown as FileSystemDirectoryHandle;
      const result = await detectDevicePreset(handle);
      expect(result).toBe("walkman");
    });

    it("returns generic when not ipod, no .rockbox, and name does not match walkman", async () => {
      mockVerifyIpodStructure.mockResolvedValue(false);
      const handle = {
        name: "USB_DRIVE",
        getDirectoryHandle: jest.fn().mockRejectedValue(new Error("not found")),
      } as unknown as FileSystemDirectoryHandle;
      const result = await detectDevicePreset(handle);
      expect(result).toBe("generic");
    });
  });
});


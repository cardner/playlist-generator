/**
 * Unit tests for SysInfo parser.
 */

import { getDeviceInfoFromSysInfo } from "@/features/devices/ipod/device/parse-sysinfo";

describe("device/parse-sysinfo", () => {
  it("parses ModelNumStr and maps to model name and checksum_type", () => {
    const text = "FirewireGuid: 0x12345678\nModelNumStr: MA002\n";
    const buf = new TextEncoder().encode(text);
    const info = getDeviceInfoFromSysInfo(buf);
    expect(info.model_number).toBe("MA002");
    expect(info.model_name).toBe("iPod Video (5th Gen)");
    expect(info.generation_name).toBe("iPod Video (5th Gen)");
    expect(info.device_recognized).toBe(true);
    expect(info.checksum_type).toBe(0);
  });

  it("sets checksum_type 1 for encrypted models", () => {
    const text = "ModelNumStr: MB029\n";
    const buf = new TextEncoder().encode(text);
    const info = getDeviceInfoFromSysInfo(buf);
    expect(info.model_number).toBe("MB029");
    expect(info.model_name).toBe("iPod Classic 6th/7th Gen");
    expect(info.checksum_type).toBe(1);
  });

  it("returns device_recognized false and checksum_type 0 for unknown model", () => {
    const text = "ModelNumStr: UNKNOWN\n";
    const buf = new TextEncoder().encode(text);
    const info = getDeviceInfoFromSysInfo(buf);
    expect(info.model_number).toBe("UNKNOWN");
    expect(info.model_name).toBeUndefined();
    expect(info.device_recognized).toBe(false);
    expect(info.checksum_type).toBe(0);
  });

  it("handles empty buffer", () => {
    const info = getDeviceInfoFromSysInfo(new Uint8Array(0));
    expect(info.model_number).toBeUndefined();
    expect(info.device_recognized).toBe(false);
  });
});

/**
 * Parse iPod Device/SysInfo (and optionally SysInfoExtended) to IpodDeviceInfo.
 * SysInfo is a text file with "Key: value" lines (e.g. ModelNumStr: MA002, FirewireGuid: 0x...).
 * See firewire-setup.ts for write format; libgpod reads this to populate Itdb_Device.
 */

import type { IpodDeviceInfo } from "../db-types";

/** Model number string (from SysInfo) -> name and whether device requires encryption setup (checksum_type !== 0) */
const MODEL_NUM_TO_INFO: Record<string, { name: string; encrypted: boolean }> = {
  M8946: { name: "iPod 3rd Gen", encrypted: false },
  M8513: { name: "iPod 2nd Gen", encrypted: false },
  M9282: { name: "iPod 4th Gen (Grayscale)", encrypted: false },
  MA079: { name: "iPod Photo/Color", encrypted: false },
  M9160: { name: "iPod Mini", encrypted: false },
  MA002: { name: "iPod Video (5th Gen)", encrypted: false },
  MA350: { name: "iPod Nano 1st Gen", encrypted: false },
  MA477: { name: "iPod Nano 2nd Gen", encrypted: false },
  MB029: { name: "iPod Classic 6th/7th Gen", encrypted: true },
  MA978: { name: "iPod Nano 3rd Gen", encrypted: true },
  MB754: { name: "iPod Nano 4th Gen", encrypted: true },
  MC031: { name: "iPod Nano 5th Gen", encrypted: true },
  MC525: { name: "iPod Nano 6th Gen", encrypted: true },
  MD480: { name: "iPod Nano 7th Gen", encrypted: true },
  M9724: { name: "iPod Shuffle 1st Gen", encrypted: false },
  MA564: { name: "iPod Shuffle 2nd Gen", encrypted: false },
  MB225: { name: "iPod Shuffle 3rd Gen", encrypted: false },
  MC749: { name: "iPod Shuffle 4th Gen", encrypted: false },
};

function parseKeyValueLines(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key && value !== undefined) map.set(key, value);
  }
  return map;
}

/**
 * Parse SysInfo buffer (UTF-8 text) into IpodDeviceInfo.
 * Optionally pass SysInfoExtended buffer for extra fields (e.g. capacity); not yet parsed.
 */
export function getDeviceInfoFromSysInfo(
  sysInfoBuffer: Uint8Array,
  _sysInfoExtended?: Uint8Array
): IpodDeviceInfo {
  const text = new TextDecoder("utf-8").decode(sysInfoBuffer);
  const map = parseKeyValueLines(text);

  const modelNumStr = map.get("ModelNumStr") ?? map.get("modelNumStr") ?? "";
  const info = modelNumStr ? MODEL_NUM_TO_INFO[modelNumStr] : null;

  let capacity_gb: number | undefined;
  const capacityKeys = ["Capacity", "CapacityInGB", "TotalSpace", "TotalSpaceGB", "SizeInGB"];
  for (const key of capacityKeys) {
    const raw = map.get(key) ?? map.get(key.toLowerCase());
    if (raw != null) {
      const n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n > 0) {
        capacity_gb = n;
        break;
      }
    }
  }

  const deviceInfo: IpodDeviceInfo = {
    model_number: modelNumStr || undefined,
    model_name: info?.name,
    generation_name: info?.name,
    device_recognized: !!info,
    checksum_type: info?.encrypted ? 1 : 0,
    capacity_gb,
  };

  return deviceInfo;
}

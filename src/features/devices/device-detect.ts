import { verifyIpodStructure } from "./ipod";

export type DevicePreset = "generic" | "walkman" | "ipod";

export async function detectDevicePreset(
  handle: FileSystemDirectoryHandle
): Promise<DevicePreset> {
  if (await verifyIpodStructure(handle)) {
    return "ipod";
  }
  const lowerName = handle.name.toLowerCase();
  if (lowerName.includes("walkman") || lowerName.includes("sony")) {
    return "walkman";
  }
  return "generic";
}

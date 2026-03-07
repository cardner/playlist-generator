import { verifyIpodStructure } from "./ipod";

export type DevicePreset = "generic" | "walkman" | "ipod" | "rockbox";

export async function detectDevicePreset(
  handle: FileSystemDirectoryHandle
): Promise<DevicePreset> {
  if (await verifyIpodStructure(handle)) {
    return "ipod";
  }
  try {
    await handle.getDirectoryHandle(".rockbox");
    return "rockbox";
  } catch {
    // no .rockbox directory
  }
  const lowerName = handle.name.toLowerCase();
  if (lowerName.includes("walkman") || lowerName.includes("sony")) {
    return "walkman";
  }
  return "generic";
}

import { logger } from "@/lib/logger";

const APPLE_VENDOR_ID = 0x05ac;

type IpodModelInfo = {
  name: string;
  modelNumStr: string;
  encrypted: boolean;
};

const IPOD_MODELS: Record<number, IpodModelInfo> = {
  0x1201: { name: "iPod 3rd Gen", modelNumStr: "M8946", encrypted: false },
  0x1202: { name: "iPod 2nd Gen", modelNumStr: "M8513", encrypted: false },
  0x1203: { name: "iPod 4th Gen (Grayscale)", modelNumStr: "M9282", encrypted: false },
  0x1204: { name: "iPod Photo/Color", modelNumStr: "MA079", encrypted: false },
  0x1205: { name: "iPod Mini", modelNumStr: "M9160", encrypted: false },
  0x1209: { name: "iPod Video (5th Gen)", modelNumStr: "MA002", encrypted: false },
  0x120a: { name: "iPod Nano 1st Gen", modelNumStr: "MA350", encrypted: false },
  0x1260: { name: "iPod Nano 2nd Gen", modelNumStr: "MA477", encrypted: false },
  0x1261: { name: "iPod Classic 6th/7th Gen", modelNumStr: "MB029", encrypted: true },
  0x1262: { name: "iPod Nano 3rd Gen", modelNumStr: "MA978", encrypted: true },
  0x1263: { name: "iPod Nano 4th Gen", modelNumStr: "MB754", encrypted: true },
  0x1265: { name: "iPod Nano 5th Gen", modelNumStr: "MC031", encrypted: true },
  0x1266: { name: "iPod Nano 6th Gen", modelNumStr: "MC525", encrypted: true },
  0x1267: { name: "iPod Nano 7th Gen", modelNumStr: "MD480", encrypted: true },
  0x1300: { name: "iPod Shuffle 1st Gen", modelNumStr: "M9724", encrypted: false },
  0x1301: { name: "iPod Shuffle 2nd Gen", modelNumStr: "MA564", encrypted: false },
  0x1302: { name: "iPod Shuffle 3rd Gen", modelNumStr: "MB225", encrypted: false },
  0x1303: { name: "iPod Shuffle 4th Gen", modelNumStr: "MC749", encrypted: false },
};

export type WebUsbDeviceInfo = {
  serialNumber: string;
  productId: number;
  productName: string;
  manufacturerName: string;
};

type WebUsbNavigator = Navigator & {
  usb?: {
    requestDevice: (options: unknown) => Promise<any>;
    getDevices?: () => Promise<any[]>;
  };
};

export function requiresEncryption(productId: number): boolean {
  return IPOD_MODELS[productId]?.encrypted ?? false;
}

export function getModelInfo(productId: number): IpodModelInfo | null {
  return IPOD_MODELS[productId] ?? null;
}

export async function getDeviceViaWebUSB(): Promise<WebUsbDeviceInfo> {
  const webUsbNavigator = navigator as WebUsbNavigator;
  if (!webUsbNavigator.usb) {
    throw new Error("WebUSB not supported in this browser");
  }
  const device = await webUsbNavigator.usb.requestDevice({
    filters: [{ vendorId: APPLE_VENDOR_ID }],
  });
  if (!device.serialNumber) {
    throw new Error("Unable to read iPod serial number");
  }
  return {
    serialNumber: device.serialNumber,
    productId: device.productId,
    productName: device.productName || "Unknown",
    manufacturerName: device.manufacturerName || "Apple",
  };
}

export async function listKnownIpodDevices(): Promise<WebUsbDeviceInfo[]> {
  const webUsbNavigator = navigator as WebUsbNavigator;
  if (!webUsbNavigator.usb?.getDevices) {
    return [];
  }
  const devices = await webUsbNavigator.usb.getDevices();
  return devices
    .filter((device) => device.vendorId === APPLE_VENDOR_ID)
    .map((device) => ({
      serialNumber: device.serialNumber || "",
      productId: device.productId,
      productName: device.productName || "Unknown",
      manufacturerName: device.manufacturerName || "Apple",
    }));
}

async function readSysInfo(ipodHandle: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const control = await ipodHandle.getDirectoryHandle("iPod_Control", { create: false });
    const deviceDir = await control.getDirectoryHandle("Device", { create: false });
    for (const filename of ["SysInfo", "SysInfoExtended"]) {
      try {
        const handle = await deviceDir.getFileHandle(filename, { create: false });
        const file = await handle.getFile();
        return await file.text();
      } catch {
        // try next
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function isSysInfoSetup(ipodHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const content = await readSysInfo(ipodHandle);
  if (!content) return false;
  return content.includes("ModelNumStr");
}

export async function writeSysInfoSetup(options: {
  ipodHandle: FileSystemDirectoryHandle;
  serialNumber: string;
  productId?: number;
}): Promise<void> {
  const { ipodHandle, serialNumber, productId } = options;
  const modelInfo = productId ? getModelInfo(productId) : null;

  const control = await ipodHandle.getDirectoryHandle("iPod_Control", { create: true });
  const deviceDir = await control.getDirectoryHandle("Device", { create: true });

  let existing = "";
  try {
    const handle = await deviceDir.getFileHandle("SysInfo", { create: false });
    const file = await handle.getFile();
    existing = await file.text();
  } catch {
    existing = "";
  }

  const lines = existing
    .split("\n")
    .filter((line) => !line.startsWith("FirewireGuid") && !line.startsWith("ModelNumStr"));

  lines.push(`FirewireGuid: 0x${serialNumber}`);
  lines.push(`ModelNumStr: ${modelInfo?.modelNumStr ?? "UNKNOWN"}`);

  const nextContent = `${lines.filter(Boolean).join("\n")}\n`;
  const sysInfoHandle = await deviceDir.getFileHandle("SysInfo", { create: true });
  const writable = await sysInfoHandle.createWritable();
  await writable.write(nextContent);
  await writable.close();

  if (modelInfo) {
    logger.info(`Detected ${modelInfo.name}`);
  } else if (productId) {
    logger.warn(`Unknown iPod product ID: 0x${productId.toString(16)}`);
  }
}

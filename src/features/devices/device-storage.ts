/**
 * Device storage operations for USB sync profiles.
 */

import { db } from "@/db/schema";
import type {
  DeviceProfileRecord,
  DeviceSyncManifestRecord,
  DeviceFileIndexRecord,
  DeviceTrackMappingRecord,
} from "@/db/schema";

export type DeviceProfileInput = Omit<
  DeviceProfileRecord,
  "id" | "createdAt" | "updatedAt" | "lastSyncAt"
> & {
  id?: string;
  lastSyncAt?: number;
};

export async function saveDeviceProfile(input: DeviceProfileInput): Promise<DeviceProfileRecord> {
  const now = Date.now();
  const id = input.id ?? `device-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = await db.deviceProfiles.get(id);

  const record: DeviceProfileRecord = {
    id,
    label: input.label,
    deviceType: input.deviceType ?? existing?.deviceType,
    handleRef: input.handleRef ?? existing?.handleRef,
    playlistFormat: input.playlistFormat,
    playlistFolder: input.playlistFolder,
    pathStrategy: input.pathStrategy,
    absolutePathPrefix: input.absolutePathPrefix,
    containerLibraryPrefix:
      input.containerLibraryPrefix ?? existing?.containerLibraryPrefix,
    jellyfinExportMode: input.jellyfinExportMode ?? existing?.jellyfinExportMode,
    usbVendorId: input.usbVendorId ?? existing?.usbVendorId,
    usbProductId: input.usbProductId ?? existing?.usbProductId,
    usbSerialNumber: input.usbSerialNumber ?? existing?.usbSerialNumber,
    usbProductName: input.usbProductName ?? existing?.usbProductName,
    usbManufacturerName: input.usbManufacturerName ?? existing?.usbManufacturerName,
    ipodModelName: input.ipodModelName ?? existing?.ipodModelName,
    ipodGenerationName: input.ipodGenerationName ?? existing?.ipodGenerationName,
    ipodModelNumber: input.ipodModelNumber ?? existing?.ipodModelNumber,
    ipodRequiresEncryption: input.ipodRequiresEncryption ?? existing?.ipodRequiresEncryption,
    lastSyncAt: input.lastSyncAt ?? existing?.lastSyncAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.deviceProfiles.put(record);
  return record;
}

export async function getDeviceProfiles(): Promise<DeviceProfileRecord[]> {
  return db.deviceProfiles.toArray();
}

export async function getDeviceProfile(id: string): Promise<DeviceProfileRecord | undefined> {
  return db.deviceProfiles.get(id);
}

export async function deleteDeviceProfile(id: string): Promise<void> {
  await db.deviceProfiles.delete(id);
}

export async function deleteDeviceProfileWithManifests(id: string): Promise<void> {
  await db.transaction("rw", [db.deviceProfiles, db.deviceSyncManifests, db.deviceTrackMappings], async () => {
    await db.deviceSyncManifests.where("deviceId").equals(id).delete();
    await db.deviceTrackMappings.where("deviceId").equals(id).delete();
    await db.deviceProfiles.delete(id);
  });
}

export async function saveDeviceSyncManifest(
  manifest: DeviceSyncManifestRecord
): Promise<DeviceSyncManifestRecord> {
  await db.deviceSyncManifests.put(manifest);
  return manifest;
}

export async function saveDeviceFileIndexEntries(
  entries: DeviceFileIndexRecord[]
): Promise<void> {
  if (entries.length === 0) return;
  await db.deviceFileIndex.bulkPut(entries);
}

export async function getDeviceFileIndexEntries(
  deviceId: string
): Promise<DeviceFileIndexRecord[]> {
  return db.deviceFileIndex.where("deviceId").equals(deviceId).toArray();
}

export async function getDeviceFileIndexMap(
  deviceId: string
): Promise<Map<string, DeviceFileIndexRecord>> {
  const entries = await getDeviceFileIndexEntries(deviceId);
  const map = new Map<string, DeviceFileIndexRecord>();
  for (const entry of entries) {
    map.set(entry.matchKey, entry);
  }
  return map;
}

export async function clearDeviceFileIndex(deviceId: string): Promise<void> {
  await db.deviceFileIndex.where("deviceId").equals(deviceId).delete();
}

export async function getDeviceSyncManifest(
  deviceId: string,
  playlistId: string
): Promise<DeviceSyncManifestRecord | undefined> {
  const id = `${deviceId}-${playlistId}`;
  return db.deviceSyncManifests.get(id);
}

/**
 * Saves a mapping from a library track to an iPod device track.
 * Used so the next sync reuses the same device track instead of copying the file again.
 * Optional acoustidId is stored for AcoustID-based matching on future syncs.
 */
export async function saveDeviceTrackMapping(
  deviceId: string,
  libraryTrackId: string,
  deviceTrackId: number,
  acoustidId?: string
): Promise<DeviceTrackMappingRecord> {
  const now = Date.now();
  const id = `${deviceId}-${libraryTrackId}`;
  const record: DeviceTrackMappingRecord = {
    id,
    deviceId,
    libraryTrackId,
    deviceTrackId,
    ...(acoustidId ? { acoustidId } : {}),
    updatedAt: now,
  };
  await db.deviceTrackMappings.put(record);
  return record;
}

/**
 * Returns all library→device track mappings for a device (used at sync start to resolve existing tracks).
 */
export async function getDeviceTrackMappings(
  deviceId: string
): Promise<DeviceTrackMappingRecord[]> {
  return db.deviceTrackMappings.where("deviceId").equals(deviceId).toArray();
}

/**
 * Removes all track mappings for a device (e.g. when clearing device data or deleting the profile).
 */
export async function clearDeviceTrackMappings(deviceId: string): Promise<void> {
  await db.deviceTrackMappings.where("deviceId").equals(deviceId).delete();
}

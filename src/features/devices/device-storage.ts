/**
 * Device storage operations for USB sync profiles.
 */

import { db } from "@/db/schema";
import type { DeviceProfileRecord, DeviceSyncManifestRecord } from "@/db/schema";

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
    handleRef: input.handleRef,
    playlistFormat: input.playlistFormat,
    playlistFolder: input.playlistFolder,
    pathStrategy: input.pathStrategy,
    absolutePathPrefix: input.absolutePathPrefix,
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

export async function saveDeviceSyncManifest(
  manifest: DeviceSyncManifestRecord
): Promise<DeviceSyncManifestRecord> {
  await db.deviceSyncManifests.put(manifest);
  return manifest;
}

export async function getDeviceSyncManifest(
  deviceId: string,
  playlistId: string
): Promise<DeviceSyncManifestRecord | undefined> {
  const id = `${deviceId}-${playlistId}`;
  return db.deviceSyncManifests.get(id);
}

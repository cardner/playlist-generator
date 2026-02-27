/**
 * Default iTunesDB dbversion per iPod model (ModelNumStr from SysInfo).
 * Used when the existing iTunesDB is empty (e.g. freshly restored) so we write
 * the correct mhbd/mhit header layout for the device.
 * Aligns with parse.ts MHIT_HEADER_SIZE (0x0b→0x9c, 0x14→0x184, etc.).
 */

import type { IpodDbModel } from "../db-types";
import { getModelInfo } from "../firewire-setup";

/** Default dbversion per ModelNumStr. 0x75 = iTunes-compatible 5th/7th gen (0xf4 mhbd, 0x184 mhit). */
const MODEL_NUM_TO_DBVERSION: Record<string, number> = {
  M8946: 0x0b, // iPod 3rd Gen
  M8513: 0x0b, // iPod 2nd Gen
  M9282: 0x0b, // iPod 4th Gen (Grayscale)
  MA079: 0x0b, // iPod Photo/Color
  M9160: 0x0b, // iPod Mini
  MA002: 0x75, // iPod Video (5th Gen) - iTunes-compatible
  MA350: 0x0b, // iPod Nano 1st Gen
  MA477: 0x0d, // iPod Nano 2nd Gen (0xf4 mhit)
  MB029: 0x75, // iPod Classic 6th/7th Gen - iTunes-compatible
  MA978: 0x14, // iPod Nano 3rd Gen
  MB754: 0x14, // iPod Nano 4th Gen
  MC031: 0x14, // iPod Nano 5th Gen
  MC525: 0x14, // iPod Nano 6th Gen
  MD480: 0x14, // iPod Nano 7th Gen
  M9724: 0x0b, // iPod Shuffle 1st Gen
  MA564: 0x0b, // iPod Shuffle 2nd Gen
  MB225: 0x0b, // iPod Shuffle 3rd Gen
  MC749: 0x0b, // iPod Shuffle 4th Gen
};

/** Safe default for unknown models (legacy 0x9c mhit). */
const DEFAULT_DBVERSION = 0x0b;

/**
 * Returns the default dbversion for an iPod model. Use when the existing
 * iTunesDB is empty so we write the correct header layout.
 * @param modelNumber - ModelNumStr from SysInfo (e.g. MA002, MB029)
 * @param productId - USB product ID (used if modelNumber is missing; resolved via getModelInfo)
 */
export function getDefaultDbversionForModel(
  modelNumber?: string,
  productId?: number
): number {
  let modelNumStr = modelNumber?.trim() || "";
  if (!modelNumStr && typeof productId === "number") {
    const info = getModelInfo(productId);
    modelNumStr = info?.modelNumStr ?? "";
  }
  if (!modelNumStr) return DEFAULT_DBVERSION;
  return MODEL_NUM_TO_DBVERSION[modelNumStr] ?? DEFAULT_DBVERSION;
}

/**
 * When we have device identity (from SysInfo model_number and/or USB productId),
 * sets model.dbversion so serialization uses the correct mhbd/mhit layout for the
 * device. Call before serializing so that e.g. MA002/MB029 get dbversion 0x75
 * (0xf4 mhbd) even when the loaded iTunesDB had a different dbversion (e.g. 48).
 */
export function ensureModelDbversionForDevice(
  model: IpodDbModel,
  options?: { model_number?: string; productId?: number }
): void {
  const modelNumber = options?.model_number ?? model.deviceInfo?.model_number;
  const productId = options?.productId;
  if (modelNumber === undefined && productId === undefined) return;
  model.dbversion = getDefaultDbversionForModel(modelNumber, productId);
}

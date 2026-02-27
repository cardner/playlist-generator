/**
 * Unit tests for dbversion-by-model (getDefaultDbversionForModel, ensureModelDbversionForDevice).
 */

import {
  getDefaultDbversionForModel,
  ensureModelDbversionForDevice,
} from "@/features/devices/ipod/itunesdb/dbversion-by-model";
import { getMhbdHeaderSize } from "@/features/devices/ipod/itunesdb/serialize";

describe("getDefaultDbversionForModel", () => {
  it("returns 0x75 for 5th gen (MA002) - iTunes-compatible", () => {
    expect(getDefaultDbversionForModel("MA002")).toBe(0x75);
  });

  it("returns 0x75 for 6th/7th gen Classic (MB029) - iTunes-compatible", () => {
    expect(getDefaultDbversionForModel("MB029")).toBe(0x75);
  });

  it("returns 0x0b for Nano 1st gen (MA350)", () => {
    expect(getDefaultDbversionForModel("MA350")).toBe(0x0b);
  });

  it("returns 0x0d for Nano 2nd gen (MA477)", () => {
    expect(getDefaultDbversionForModel("MA477")).toBe(0x0d);
  });

  it("returns 0x14 for Nano 3rd gen (MA978)", () => {
    expect(getDefaultDbversionForModel("MA978")).toBe(0x14);
  });

  it("resolves productId when model_number is missing (6th/7th gen = 0x1261)", () => {
    expect(getDefaultDbversionForModel(undefined, 0x1261)).toBe(0x75);
  });

  it("resolves productId when model_number is missing (5th gen = 0x1209)", () => {
    expect(getDefaultDbversionForModel(undefined, 0x1209)).toBe(0x75);
  });

  it("prefers model_number over productId when both provided", () => {
    expect(getDefaultDbversionForModel("MB029", 0x1209)).toBe(0x75);
  });

  it("returns 0x0b for unknown model number", () => {
    expect(getDefaultDbversionForModel("UNKNOWN")).toBe(0x0b);
  });

  it("returns 0x0b when both arguments missing", () => {
    expect(getDefaultDbversionForModel()).toBe(0x0b);
  });

  it("getMhbdHeaderSize(0x75) returns 0xf4 (iTunes-compatible 5th/7th gen)", () => {
    expect(getMhbdHeaderSize(0x75)).toBe(0xf4);
  });

  it("trims model_number", () => {
    expect(getDefaultDbversionForModel("  MA002  ")).toBe(0x75);
  });
});

describe("ensureModelDbversionForDevice", () => {
  it("sets dbversion when tracks are empty and model_number provided", () => {
    const model = { dbversion: 0x0b, tracks: [], playlists: [] };
    ensureModelDbversionForDevice(model, { model_number: "MB029" });
    expect(model.dbversion).toBe(0x75);
  });

  it("sets dbversion when tracks are empty and productId provided", () => {
    const model = { dbversion: 0x0b, tracks: [], playlists: [] };
    ensureModelDbversionForDevice(model, { productId: 0x1261 });
    expect(model.dbversion).toBe(0x75);
  });

  it("uses model.deviceInfo.model_number when options not passed", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [],
      playlists: [],
      deviceInfo: { model_number: "MA002" },
    };
    ensureModelDbversionForDevice(model);
    expect(model.dbversion).toBe(0x75);
  });

  it("sets dbversion for MA002/MB029 even when model has tracks (robust fix for device layout)", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [{ id: 0, title: "A", ipod_path: ":iPod_Control:Music:F00:a.mp3" }],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    ensureModelDbversionForDevice(model, { model_number: "MB029" });
    expect(model.dbversion).toBe(0x75);
  });

  it("does not change dbversion when no device identity", () => {
    const model = { dbversion: 0x0b, tracks: [], playlists: [] };
    ensureModelDbversionForDevice(model);
    expect(model.dbversion).toBe(0x0b);
  });
});

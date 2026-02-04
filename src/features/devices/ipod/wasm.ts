import { logger } from "@/lib/logger";

type CreateIpodModule = (options?: {
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}) => Promise<any>;

type WasmModule = {
  FS?: any;
  ccall?: (...args: any[]) => any;
  _malloc?: (size: number) => number;
  _free?: (ptr: number) => void;
  UTF8ToString?: (ptr: number) => string;
  lengthBytesUTF8?: (value: string) => number;
  stringToUTF8?: (value: string, ptr: number, len: number) => void;
  [key: string]: any;
};

const DEFAULT_WASM_SCRIPT_URL = "/ipod/ipod_manager.js";

let wasmModule: WasmModule | null = null;
let wasmReady = false;
let initPromise: Promise<boolean> | null = null;

function getCreateModule(): CreateIpodModule | null {
  return (globalThis as any).createIPodModule ?? null;
}

async function loadWasmScript(url = DEFAULT_WASM_SCRIPT_URL): Promise<void> {
  if (getCreateModule()) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-ipod-wasm="true"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load iPod WASM")));
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.defer = true;
    script.dataset.ipodWasm = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load iPod WASM: ${url}`));
    document.head.appendChild(script);
  });
}

export async function initIpodWasm(options?: { scriptUrl?: string }): Promise<boolean> {
  if (wasmReady) return true;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await loadWasmScript(options?.scriptUrl);
      const createModule = getCreateModule();
      if (!createModule) {
        throw new Error("createIPodModule not found");
      }
      wasmModule = await createModule({
        print: (text: string) => logger.info(text),
        printErr: (text: string) => logger.error(text),
      });
      wasmReady = true;
      return true;
    } catch (error) {
      logger.error("Failed to initialize iPod WASM:", error);
      wasmModule = null;
      wasmReady = false;
      return false;
    }
  })();
  return initPromise;
}

export function isIpodWasmReady(): boolean {
  return wasmReady;
}

export function getIpodWasmModule(): WasmModule | null {
  return wasmModule;
}

export function wasmCall(funcName: string, ...args: any[]): any {
  if (!wasmModule || !wasmReady) {
    logger.warn(`WASM not ready, cannot call ${funcName}`);
    return null;
  }
  const func = (wasmModule as any)[`_${funcName}`];
  if (!func) {
    logger.warn(`WASM function not found: ${funcName}`);
    return null;
  }
  try {
    return func(...args);
  } catch (error) {
    logger.error(`WASM call error (${funcName}):`, error);
    return null;
  }
}

export function wasmGetString(ptr?: number | null): string | null {
  if (!ptr || !wasmModule?.UTF8ToString) return null;
  return wasmModule.UTF8ToString(ptr);
}

export function wasmAllocString(value: string): number {
  if (!wasmModule?.lengthBytesUTF8 || !wasmModule?.stringToUTF8 || !wasmModule?._malloc) {
    throw new Error("WASM module not ready for string allocation");
  }
  const len = wasmModule.lengthBytesUTF8(value) + 1;
  const ptr = wasmModule._malloc(len);
  wasmModule.stringToUTF8(value, ptr, len);
  return ptr;
}

export function wasmFreeString(ptr: number): void {
  if (ptr && wasmModule?._free) {
    wasmModule._free(ptr);
  }
}

export function wasmCallWithStrings(
  funcName: string,
  stringArgs: string[] = [],
  otherArgs: any[] = []
): any {
  const ptrs = stringArgs.map((arg) => wasmAllocString(String(arg ?? "")));
  try {
    return wasmCall(funcName, ...ptrs, ...otherArgs);
  } finally {
    ptrs.forEach((ptr) => wasmFreeString(ptr));
  }
}

export function wasmCallWithError(funcName: string, ...args: any[]): any {
  const result = wasmCall(funcName, ...args);
  if (result !== 0 && result !== null) {
    const errorPtr = wasmCall("ipod_get_last_error");
    const error = wasmGetString(errorPtr);
    logger.error(`WASM error (${funcName}): ${error || "Unknown error"}`);
  }
  return result;
}

export function wasmGetJson(funcName: string, ...args: any[]): any {
  const ptr = wasmCall(funcName, ...args);
  if (!ptr) return null;
  const value = wasmGetString(ptr);
  wasmCall("ipod_free_string", ptr);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    logger.warn(`Failed to parse JSON from ${funcName}`, error);
    return null;
  }
}

export function wasmAddTrack(input: {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  trackNr?: number;
  cdNr?: number;
  year?: number;
  durationMs?: number;
  bitrateKbps?: number;
  samplerateHz?: number;
  sizeBytes?: number;
  filetype?: string;
}): number {
  if (!wasmModule?.ccall) return -1;
  const safeTitle = input.title || "";
  const safeArtist = input.artist || "Unknown Artist";
  const safeAlbum = input.album || "Unknown Album";
  const safeGenre = input.genre || "";
  const safeFiletype = input.filetype || "MPEG audio file";
  const safeTrackNr = Number.isFinite(input.trackNr) ? input.trackNr : 0;
  const safeCdNr = Number.isFinite(input.cdNr) ? input.cdNr : 0;
  const safeYear = Number.isFinite(input.year) ? input.year : 0;
  const safeDurationMs =
    Number.isFinite(input.durationMs) && (input.durationMs ?? 0) > 0
      ? input.durationMs
      : 180000;
  const safeBitrate =
    Number.isFinite(input.bitrateKbps) && (input.bitrateKbps ?? 0) > 0
      ? input.bitrateKbps
      : 192;
  const safeSamplerate =
    Number.isFinite(input.samplerateHz) && (input.samplerateHz ?? 0) > 0
      ? input.samplerateHz
      : 44100;
  const safeSize = Number.isFinite(input.sizeBytes) ? input.sizeBytes : 0;

  return wasmModule.ccall(
    "ipod_add_track",
    "number",
    [
      "string",
      "string",
      "string",
      "string",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "string",
    ],
    [
      safeTitle,
      safeArtist,
      safeAlbum,
      safeGenre,
      safeTrackNr,
      safeCdNr,
      safeYear,
      safeDurationMs,
      safeBitrate,
      safeSamplerate,
      safeSize,
      safeFiletype,
    ]
  );
}

export function wasmUpdateTrack(input: {
  trackIndex: number;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  trackNr?: number;
  year?: number;
  rating?: number;
}): number {
  if (!wasmModule?.ccall) return -1;
  const safeTitle = input.title ?? "";
  const safeArtist = input.artist ?? "";
  const safeAlbum = input.album ?? "";
  const safeGenre = input.genre ?? "";
  const safeTrackNr = Number.isFinite(input.trackNr) ? (input.trackNr ?? 0) : 0;
  const safeYear = Number.isFinite(input.year) ? (input.year ?? 0) : 0;
  const safeRating = Number.isFinite(input.rating) ? (input.rating ?? -1) : -1;

  return wasmModule.ccall(
    "ipod_update_track",
    "number",
    ["number", "string", "string", "string", "string", "number", "number", "number"],
    [input.trackIndex, safeTitle, safeArtist, safeAlbum, safeGenre, safeTrackNr, safeYear, safeRating]
  );
}

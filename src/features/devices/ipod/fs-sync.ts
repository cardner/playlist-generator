import { logger } from "@/lib/logger";
import { sanitizePathSegment } from "@/features/devices/path-segment";
import { getIpodWasmModule, wasmCallWithStrings } from "./wasm";

const DEFAULT_MOUNTPOINT = "/iPod";

function getFS() {
  const wasmModule = getIpodWasmModule();
  return wasmModule?.FS;
}

async function listDirNames(dirHandle: FileSystemDirectoryHandle, limit = 50) {
  const names: string[] = [];
  try {
    for await (const [name] of dirHandle.entries()) {
      names.push(name);
      if (names.length >= limit) break;
    }
  } catch {
    return names;
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export async function verifyIpodStructure(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const controlDir = await handle.getDirectoryHandle("iPod_Control", { create: false });
    let itunesDir: FileSystemDirectoryHandle;
    try {
      itunesDir = await controlDir.getDirectoryHandle("iTunes", { create: false });
    } catch (error) {
      const names = await listDirNames(controlDir);
      logger.warn("Missing iPod_Control/iTunes", { names, error });
      return false;
    }
    try {
      await itunesDir.getFileHandle("iTunesDB", { create: false });
    } catch (error) {
      const names = await listDirNames(itunesDir);
      logger.warn("Missing iTunesDB", { names, error });
      return false;
    }
    return true;
  } catch (error) {
    const err = error as DOMException | undefined;
    const names = await listDirNames(handle).catch(() => [] as string[]);
    const isStale =
      err?.name === "NotFoundError" ||
      err?.name === "SecurityError" ||
      err?.name === "InvalidStateError";
    if (isStale) {
      logger.warn("iPod handle invalid or device disconnected", { names, error });
    } else {
      logger.warn("Missing iPod_Control", { names, error });
    }
    return false;
  }
}

export async function setupWasmFilesystem(
  handle: FileSystemDirectoryHandle,
  mountpoint = DEFAULT_MOUNTPOINT
): Promise<void> {
  const FS = getFS();
  if (!FS) {
    throw new Error("WASM filesystem not ready");
  }

  try {
    FS.mkdir(mountpoint);
  } catch {
    // already exists
  }

  wasmCallWithStrings("ipod_set_mountpoint", [mountpoint]);

  const dirs = [
    `${mountpoint}/iPod_Control`,
    `${mountpoint}/iPod_Control/iTunes`,
    `${mountpoint}/iPod_Control/Device`,
    `${mountpoint}/iPod_Control/Music`,
    `${mountpoint}/iPod_Control/Artwork`,
  ];
  dirs.forEach((dir) => {
    try {
      FS.mkdir(dir);
    } catch {
      // ignore
    }
  });

  for (let i = 0; i < 50; i += 1) {
    const folder = `F${String(i).padStart(2, "0")}`;
    try {
      FS.mkdir(`${mountpoint}/iPod_Control/Music/${folder}`);
    } catch {
      // ignore
    }
  }

  await syncIpodToVirtualFS(handle, mountpoint);
}

export async function syncIpodToVirtualFS(
  handle: FileSystemDirectoryHandle,
  mountpoint = DEFAULT_MOUNTPOINT
): Promise<void> {
  const FS = getFS();
  if (!FS) {
    throw new Error("WASM filesystem not ready");
  }

  const iPodControl = await handle.getDirectoryHandle("iPod_Control", { create: false });
  const iTunes = await iPodControl.getDirectoryHandle("iTunes", { create: false });
  const dbFileHandle = await iTunes.getFileHandle("iTunesDB", { create: false });
  const dbFile = await dbFileHandle.getFile();
  const dbData = new Uint8Array(await dbFile.arrayBuffer());
  FS.writeFile(`${mountpoint}/iPod_Control/iTunes/iTunesDB`, dbData);

  try {
    const deviceDir = await iPodControl.getDirectoryHandle("Device", { create: false });
    await copyDeviceFile(deviceDir, "SysInfo", mountpoint);
    await copyDeviceFile(deviceDir, "SysInfoExtended", mountpoint);
  } catch (error) {
    logger.warn("Failed to read device info files", error);
  }

  // Copy ArtworkDB and ITHMB files so WASM can parse existing artwork and we don't clobber it on re-sync
  try {
    const artworkDir = await iPodControl.getDirectoryHandle("Artwork", { create: false });
    const artMount = `${mountpoint}/iPod_Control/Artwork`;
    for await (const [name] of artworkDir.entries()) {
      try {
        const handle = await artworkDir.getFileHandle(name, { create: false });
        const file = await handle.getFile();
        const data = new Uint8Array(await file.arrayBuffer());
        FS.writeFile(`${artMount}/${name}`, data);
      } catch (err) {
        logger.warn("Failed to copy Artwork file", { name, err });
      }
    }
  } catch (error) {
    // Artwork folder may not exist on a fresh iPod
  }
}

async function copyDeviceFile(
  deviceDir: FileSystemDirectoryHandle,
  filename: string,
  mountpoint: string
): Promise<void> {
  const FS = getFS();
  if (!FS) return;
  try {
    const handle = await deviceDir.getFileHandle(filename, { create: false });
    const file = await handle.getFile();
    const data = new Uint8Array(await file.arrayBuffer());
    FS.writeFile(`${mountpoint}/iPod_Control/Device/${filename}`, data);
  } catch (error) {
    if (filename === "SysInfo") {
      logger.info("SysInfo file not found", error as Error);
    }
  }
}

export function reserveVirtualPath(virtualPath: string): void {
  const FS = getFS();
  if (!FS) return;
  const vp = String(virtualPath || "");
  if (!vp) return;
  try {
    const parts = vp.split("/").filter(Boolean);
    let dirPath = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      dirPath += `/${parts[i]}`;
      try {
        FS.mkdir(dirPath);
      } catch {
        // ignore
      }
    }
    try {
      FS.stat(vp);
      return;
    } catch {
      // create placeholder
    }
    FS.writeFile(vp, new Uint8Array());
  } catch {
    // best-effort
  }
}

export async function writeFileToIpodRelativePath(
  ipodHandle: FileSystemDirectoryHandle,
  relativePath: string,
  file: File,
  options?: { onProgress?: (progress: { written: number; total: number; percent: number }) => void }
): Promise<void> {
  const parts = String(relativePath || "").split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Invalid destination path");
  }
  const fileName = sanitizePathSegment(parts[parts.length - 1], "track");
  const dirParts = parts.slice(0, -1);
  let currentDir = ipodHandle;
  for (const dir of dirParts) {
    const safeDir = sanitizePathSegment(dir, "_");
    currentDir = await currentDir.getDirectoryHandle(safeDir, { create: true });
  }
  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  const total = Number(file.size || 0);
  let readable: ReadableStream = file.stream();

  if (typeof options?.onProgress === "function" && total > 0) {
    let written = 0;
    readable = readable.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);
          written += chunk?.byteLength || 0;
          const percent = Math.round((written / total) * 100);
          try {
            options.onProgress?.({ written, total, percent });
          } catch {
            // ignore
          }
        },
      })
    );
  }

  try {
    await readable.pipeTo(writable);
  } catch (error) {
    try {
      await writable.abort(error as Error);
    } catch {
      // ignore
    }
    throw error;
  }
}

export async function syncDbToIpod(
  ipodHandle: FileSystemDirectoryHandle,
  mountpoint = DEFAULT_MOUNTPOINT,
  options?: { onProgress?: (progress: { percent: number; detail?: string }) => void }
): Promise<{ ok: boolean; errorCount: number; syncedCount: number }> {
  const FS = getFS();
  if (!FS) {
    throw new Error("WASM filesystem not ready");
  }
  const tasks = [
    {
      virtualPath: `${mountpoint}/iPod_Control/iTunes/iTunesDB`,
      fileName: "iTunesDB",
      optional: false,
    },
    {
      virtualPath: `${mountpoint}/iPod_Control/iTunes/iTunesSD`,
      fileName: "iTunesSD",
      optional: true,
    },
  ];

  const iPodControl = await ipodHandle.getDirectoryHandle("iPod_Control", { create: true });
  const iTunes = await iPodControl.getDirectoryHandle("iTunes", { create: true });

  let errorCount = 0;
  let syncedCount = 0;
  let completed = 0;

  for (const task of tasks) {
    let ok = false;
    let missingInMemfs = false;
    try {
      FS.stat(task.virtualPath);
      const data = FS.readFile(task.virtualPath);
      const fileHandle = await iTunes.getFileHandle(task.fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      ok = true;
    } catch (error) {
      missingInMemfs = true;
      if (!task.optional) {
        errorCount += 1;
        logger.warn(`Failed to sync ${task.fileName}`, error);
      }
    }

    if (missingInMemfs && task.optional) {
      try {
        await iTunes.removeEntry(task.fileName);
        logger.info(`Removed stale ${task.fileName}`);
      } catch {
        // ignore if not present
      }
    }

    if (ok) syncedCount += 1;
    completed += 1;
    const percent = Math.round((completed / tasks.length) * 100);
    options?.onProgress?.({ percent, detail: task.fileName });
  }

  // Sync ArtworkDB and ITHMB from virtual FS to device (written by libgpod when wasmSetTrackArtwork + ipod_write_db used)
  const artMount = `${mountpoint}/iPod_Control/Artwork`;
  try {
    FS.stat(artMount);
    const names = FS.readdir(artMount) as string[];
    const artworkDir = await iPodControl.getDirectoryHandle("Artwork", { create: true });
    for (const name of names) {
      if (name === "." || name === "..") continue;
      try {
        const data = FS.readFile(`${artMount}/${name}`) as Uint8Array;
        const fileHandle = await artworkDir.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data as BufferSource);
        await writable.close();
        syncedCount += 1;
      } catch (err) {
        logger.warn("Failed to sync Artwork file to device", { name, err });
      }
    }
  } catch {
    // Artwork dir may be missing if no artwork API or no thumbnails set; optional
  }

  return { ok: errorCount === 0, errorCount, syncedCount };
}

/**
 * Read device files into buffers (for pure TS backend, no WASM).
 */
export async function readIpodBuffersFromHandle(
  handle: FileSystemDirectoryHandle
): Promise<{ iTunesDB: Uint8Array; SysInfo?: Uint8Array }> {
  const control = await handle.getDirectoryHandle("iPod_Control", { create: false });
  const iTunes = await control.getDirectoryHandle("iTunes", { create: false });
  const dbFile = await iTunes.getFileHandle("iTunesDB", { create: false });
  const dbBlob = await (await dbFile.getFile()).arrayBuffer();
  const iTunesDB = new Uint8Array(dbBlob);

  let SysInfo: Uint8Array | undefined;
  try {
    const deviceDir = await control.getDirectoryHandle("Device", { create: false });
    const sysFile = await deviceDir.getFileHandle("SysInfo", { create: false });
    const sysBlob = await (await sysFile.getFile()).arrayBuffer();
    SysInfo = new Uint8Array(sysBlob);
  } catch {
    // optional
  }
  return { iTunesDB, SysInfo };
}

/**
 * Write iTunesDB and optional Artwork buffers to device (for pure TS backend).
 * We only write iTunesDB (and ArtworkDB/ITHMB when artwork is enabled); we do not
 * create or overwrite iTunesControl. We optionally touch existing iTunesPrefs and
 * iTunesPrefs.plist (read then write same bytes) to update their modified time; we
 * do not create or change their content.
 */
export async function syncDbToIpodFromBuffers(
  ipodHandle: FileSystemDirectoryHandle,
  buffers: {
    iTunesDB: Uint8Array;
    ArtworkDB?: Uint8Array;
    ITHMB?: Map<string, Uint8Array>;
  },
  options?: { onProgress?: (progress: { percent: number; detail?: string }) => void }
): Promise<{ ok: boolean; errorCount: number; syncedCount: number }> {
  const iPodControl = await ipodHandle.getDirectoryHandle("iPod_Control", { create: true });
  const iTunes = await iPodControl.getDirectoryHandle("iTunes", { create: true });
  let errorCount = 0;
  let syncedCount = 0;

  let didBackup = false;
  try {
    try {
      const existingDb = await iTunes.getFileHandle("iTunesDB", { create: false });
      const existingBlob = await (await existingDb.getFile()).arrayBuffer();
      const backupWritable = await iTunes.getFileHandle("iTunesDB.bak", { create: true }).then((h) => h.createWritable());
      await backupWritable.write(new Uint8Array(existingBlob));
      await backupWritable.write({ type: "truncate" as const, size: existingBlob.byteLength });
      await backupWritable.close();
      didBackup = true;
      logger.info("iTunesDB backed up to iTunesDB.bak");
    } catch (e) {
      // iTunesDB may not exist (fresh device) or backup failed; continue with write
      logger.debug("No existing iTunesDB or backup skipped", e);
    }
    logger.info("Opening iTunesDB on device for write...");
    const writable = await iTunes.getFileHandle("iTunesDB", { create: true }).then((h) => h.createWritable());
    logger.info("Writing iTunesDB buffer to device...");
    const dbLen = buffers.iTunesDB.length;
    await writable.write(buffers.iTunesDB.slice(0));
    await writable.write({ type: "truncate" as const, size: dbLen });
    await writable.close();
    logger.info("iTunesDB written to device");
    syncedCount += 1;
    options?.onProgress?.({ percent: 50, detail: "iTunesDB" });
    if (didBackup) {
      try {
        await iTunes.removeEntry("iTunesDB.bak");
        logger.info("iTunesDB.bak removed after successful write");
      } catch (e) {
        logger.warn("Could not remove iTunesDB.bak", e);
      }
    }
  } catch (error) {
    errorCount += 1;
    logger.warn("Failed to write iTunesDB", error);
  }

  const artDir = await iPodControl.getDirectoryHandle("Artwork", { create: true });
  const hasArtwork = buffers.ArtworkDB || (buffers.ITHMB && buffers.ITHMB.size > 0);
  if (hasArtwork) {
    logger.info(
      "Writing artwork to device (ArtworkDB + ITHMB)...",
      {
        hasArtworkDB: Boolean(buffers.ArtworkDB),
        ithmbFileCount: buffers.ITHMB?.size ?? 0,
      }
    );
  }

  if (buffers.ArtworkDB) {
    try {
      const w = await artDir.getFileHandle("ArtworkDB", { create: true }).then((h) => h.createWritable());
      const artLen = buffers.ArtworkDB.length;
      await w.write(buffers.ArtworkDB.slice(0));
      await w.write({ type: "truncate" as const, size: artLen });
      await w.close();
      syncedCount += 1;
    } catch (err) {
      logger.warn("Failed to write ArtworkDB", err);
    }
  }
  if (buffers.ITHMB && buffers.ITHMB.size > 0) {
    for (const [name, data] of buffers.ITHMB) {
      try {
        const w = await artDir.getFileHandle(name, { create: true }).then((h) => h.createWritable());
        const dataLen = data.length;
        await w.write(data.slice(0));
        await w.write({ type: "truncate" as const, size: dataLen });
        await w.close();
        syncedCount += 1;
      } catch (err) {
        logger.warn("Failed to write ITHMB", { name, err });
      }
    }
  }
  if (hasArtwork) {
    logger.info("Artwork written to device");
  }

  for (const prefsName of ["iTunesPrefs", "iTunesPrefs.plist"]) {
    try {
      const prefsHandle = await iTunes.getFileHandle(prefsName, { create: false });
      const prefsFile = await prefsHandle.getFile();
      const prefsBuffer = new Uint8Array(await prefsFile.arrayBuffer());
      const writable = await iTunes.getFileHandle(prefsName, { create: true }).then((h) => h.createWritable());
      await writable.write(prefsBuffer);
      await writable.write({ type: "truncate" as const, size: prefsBuffer.length });
      await writable.close();
    } catch (err) {
      logger.warn("Could not touch prefs file (optional)", { name: prefsName, err });
    }
  }

  options?.onProgress?.({ percent: 100, detail: "done" });
  return { ok: errorCount === 0, errorCount, syncedCount };
}

export async function deleteFileFromIpodRelativePath(
  ipodHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<void> {
  const parts = String(relativePath || "").split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Invalid destination path");
  }
  const fileName = parts[parts.length - 1];
  const dirParts = parts.slice(0, -1);
  let currentDir = ipodHandle;
  for (const dir of dirParts) {
    currentDir = await currentDir.getDirectoryHandle(dir, { create: false });
  }
  await currentDir.removeEntry(fileName, { recursive: false });
}

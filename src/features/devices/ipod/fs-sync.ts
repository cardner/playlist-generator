import { logger } from "@/lib/logger";
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
    const names = await listDirNames(handle);
    logger.warn("Missing iPod_Control", { names, error });
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
  const fileName = parts[parts.length - 1];
  const dirParts = parts.slice(0, -1);
  let currentDir = ipodHandle;
  for (const dir of dirParts) {
    currentDir = await currentDir.getDirectoryHandle(dir, { create: true });
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

import { wasmCall, wasmCallWithStrings, wasmGetString } from "./wasm";

export function createIpodPaths(mountpoint = "/iPod") {
  const mp = String(mountpoint || "/iPod");
  const mpPrefix = mp.endsWith("/") ? mp : `${mp}/`;

  function normalizeRelFsPath(relFsPath: string) {
    return String(relFsPath || "").replace(/^\/+/, "");
  }

  function toVfsPath(relFsPath: string) {
    const rel = normalizeRelFsPath(relFsPath);
    return `${mpPrefix}${rel}`;
  }

  function toRelFsPathFromVfs(vfsPath: string) {
    const vp = String(vfsPath || "");
    if (vp.startsWith(mpPrefix)) return vp.slice(mpPrefix.length);
    if (vp.startsWith(mp)) return vp.slice(mp.length).replace(/^\/+/, "");
    return vp.replace(/^\/+/, "");
  }

  function wasmStringCall(funcName: string, stringArgs: string[] = [], otherArgs: any[] = []) {
    const ptr = wasmCallWithStrings(funcName, stringArgs, otherArgs);
    if (!ptr) return null;
    const value = wasmGetString(ptr);
    wasmCall("ipod_free_string", ptr);
    return value;
  }

  function toIpodDbPathFromRel(relFsPath: string) {
    const rel = normalizeRelFsPath(relFsPath);
    return wasmStringCall("ipod_path_to_ipod_format", [`/${rel}`]);
  }

  function toRelFsPathFromIpodDbPath(ipodDbPath: string) {
    const fsPath = wasmStringCall("ipod_path_to_fs_format", [String(ipodDbPath || "")]);
    return normalizeRelFsPath(fsPath || "");
  }

  return {
    mountpoint: mp,
    normalizeRelFsPath,
    toVfsPath,
    toRelFsPathFromVfs,
    toIpodDbPathFromRel,
    toRelFsPathFromIpodDbPath,
  };
}

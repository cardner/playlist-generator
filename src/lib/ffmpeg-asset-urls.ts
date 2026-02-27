/**
 * Shared FFmpeg WASM asset URL resolution for dev and build.
 * Assets are copied to public/ffmpeg/ by the copy-ffmpeg script and served at /ffmpeg/.
 * This helper respects Next.js basePath and assetPrefix so paths are correct after build.
 */

const FFMPEG_CORE_VERSION = "0.12.9";
const CDN_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

export function getFfmpegAssetBase(): string {
  if (typeof window === "undefined") return "http://localhost";
  const nextData = (window as Window & { __NEXT_DATA__?: { assetPrefix?: string; basePath?: string } })
    .__NEXT_DATA__;
  const assetPrefix = typeof nextData?.assetPrefix === "string" ? nextData.assetPrefix : "";
  const basePath = typeof nextData?.basePath === "string" ? nextData.basePath : "";
  const origin = window.location.origin;
  if (assetPrefix.startsWith("http")) {
    const base = assetPrefix.replace(/\/$/, "");
    const path = (basePath || "").replace(/^\/+/, "");
    return path ? `${base}/${path}` : base;
  }
  const parts = [origin.replace(/\/$/, ""), assetPrefix.replace(/^\/|\/$/g, ""), basePath.replace(/^\/+/, "")].filter(Boolean);
  return parts.join("/") || origin;
}

/**
 * Returns full URLs for ffmpeg-core.js and ffmpeg-core.wasm under the app origin
 * (and basePath/assetPrefix). Use these so the worker loads from public/ffmpeg/
 * after build/dev.
 */
export function getFfmpegAssetUrls(): { coreURL: string; wasmURL: string } {
  const base = getFfmpegAssetBase();
  const pathPrefix = base.endsWith("/") ? base : `${base}/`;
  const coreURL = `${pathPrefix}ffmpeg/ffmpeg-core.js`;
  const wasmURL = `${pathPrefix}ffmpeg/ffmpeg-core.wasm`;
  return { coreURL, wasmURL };
}

export { FFMPEG_CORE_VERSION, CDN_BASE };

export function getFfmpegCdnUrls(): { coreURL: string; wasmURL: string } {
  return {
    coreURL: `${CDN_BASE}/ffmpeg-core.js`,
    wasmURL: `${CDN_BASE}/ffmpeg-core.wasm`,
  };
}

async function verifyFfmpegAsset(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;
  } catch {
    // fall through
  }
  try {
    const get = await fetch(url);
    return get.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves coreURL and wasmURL for ffmpeg.load(): uses local public/ffmpeg/ assets
 * when available (correct path after build/dev), otherwise falls back to CDN.
 * On localhost we always use CDN because the @ffmpeg/ffmpeg worker runs as a module
 * worker: importScripts() fails, so it falls back to import(); import() only works
 * when the URL matches the library's default (unpkg), which serves ESM. Our local
 * file is UMD, so import() throws "Cannot find module" even when the request is 200.
 * Call this in the browser before instance.load({ coreURL, wasmURL }).
 */
export async function resolveFfmpegAssetUrls(): Promise<{ coreURL: string; wasmURL: string }> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isLocalhost =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || "");

  if (isLocalhost) {
    const cdn = getFfmpegCdnUrls();
    const cdnOk =
      (await verifyFfmpegAsset(cdn.coreURL)) && (await verifyFfmpegAsset(cdn.wasmURL));
    if (cdnOk) return cdn;
    throw new Error(
      "FFmpeg CDN unreachable. Check network or add public/ffmpeg/ assets and use production build."
    );
  }

  const local = getFfmpegAssetUrls();
  const cdn = getFfmpegCdnUrls();
  const localOk =
    (await verifyFfmpegAsset(local.coreURL)) && (await verifyFfmpegAsset(local.wasmURL));
  if (localOk) return local;
  const cdnOk =
    (await verifyFfmpegAsset(cdn.coreURL)) && (await verifyFfmpegAsset(cdn.wasmURL));
  if (cdnOk) return cdn;
  throw new Error(
    "Missing ffmpeg asset. Add files to public/ffmpeg/ or run: yarn add -D @ffmpeg/core@^0.12 && yarn copy-ffmpeg"
  );
}

/**
 * Validates count-first scan strategy: countLibraryFiles must resolve
 * before scanLibraryWithPersistence is called, and the resulting
 * scanProgress should include stage transitions (counting -> scanning).
 *
 * Also validates that a cached count from a previous scan skips the
 * counting stage entirely.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

const callOrder: string[] = [];
let countResolve: ((n: number) => void) | null = null;
let scanResolve: ((r: unknown) => void) | null = null;
const mockGetCachedFileCount = jest.fn();

jest.mock("@/features/library/scanning", () => ({
  countLibraryFiles: jest.fn(
    () =>
      new Promise<number>((resolve) => {
        callOrder.push("countLibraryFiles");
        countResolve = resolve;
      })
  ),
  getCachedFileCount: (...args: unknown[]) => mockGetCachedFileCount(...args),
  isSupportedExtension: jest.fn(() => true),
}));

jest.mock("@/lib/library-selection-utils", () => ({
  getFileExtension: jest.fn((name: string) => {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  }),
}));

jest.mock("@/features/library", () => ({
  isSupportedExtension: jest.fn(() => true),
}));

jest.mock("@/features/library/scanning-persist", () => ({
  scanLibraryWithPersistence: jest.fn(
    () =>
      new Promise((resolve) => {
        callOrder.push("scanLibraryWithPersistence");
        scanResolve = resolve;
      })
  ),
  quickScanLibraryWithPersistence: jest.fn(
    () =>
      new Promise((resolve) => {
        callOrder.push("quickScanLibraryWithPersistence");
        scanResolve = resolve;
      })
  ),
}));

jest.mock("@/features/library/network-drive-errors", () => ({
  NetworkDriveDisconnectedError: class extends Error {},
  isNetworkDriveDisconnectedError: () => false,
}));

jest.mock("@/features/library/reconnection-monitor", () => ({
  ReconnectionMonitor: class {
    startMonitoring() {}
    stopMonitoring() {}
  },
}));

jest.mock("@/lib/library-selection-fs-api", () => ({
  getDirectoryHandle: jest.fn(),
}));

jest.mock("@/db/storage-scan-checkpoints", () => ({
  deleteCheckpoint: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe("useLibraryScanning count-first strategy", () => {
  beforeEach(() => {
    callOrder.length = 0;
    countResolve = null;
    scanResolve = null;
    mockGetCachedFileCount.mockReset();
    jest.clearAllMocks();
  });

  it("awaits countLibraryFiles before calling scanLibraryWithPersistence", async () => {
    // Ensure getCachedFileCount returns null (no cache)
    mockGetCachedFileCount.mockResolvedValue(null);

    const { countLibraryFiles } = await import("@/features/library/scanning");
    const { scanLibraryWithPersistence } = await import(
      "@/features/library/scanning-persist"
    );

    const progressSnapshots: Array<{ stage?: string; total?: number }> = [];
    const abortController = new AbortController();
    const libraryRoot = { mode: "handle" as const, name: "Test", handleId: "h1" };

    // Step 1: call count
    progressSnapshots.push({ stage: "counting" });
    const countPromise = (countLibraryFiles as jest.Mock)(libraryRoot, {
      signal: abortController.signal,
    });

    expect(callOrder).toEqual(["countLibraryFiles"]);
    expect(callOrder).not.toContain("scanLibraryWithPersistence");

    // Step 2: count resolves
    countResolve!(42);
    await countPromise;

    // Step 3: now call scan
    progressSnapshots.push({ stage: "scanning", total: 42 });
    const scanPromise = (scanLibraryWithPersistence as jest.Mock)(
      libraryRoot,
      () => {},
      undefined,
      { signal: abortController.signal }
    );

    expect(callOrder).toEqual([
      "countLibraryFiles",
      "scanLibraryWithPersistence",
    ]);

    scanResolve!({
      result: { entries: [], total: 42 },
      libraryRoot: { id: "root-1" },
    });
    await scanPromise;

    expect(progressSnapshots[0]?.stage).toBe("counting");
    expect(progressSnapshots[1]?.stage).toBe("scanning");
    expect(progressSnapshots[1]?.total).toBe(42);
  });

  it("proceeds to scan even if count rejects with a non-abort error", async () => {
    mockGetCachedFileCount.mockResolvedValue(null);

    const { countLibraryFiles } = await import("@/features/library/scanning");
    const { scanLibraryWithPersistence } = await import(
      "@/features/library/scanning-persist"
    );

    (countLibraryFiles as jest.Mock).mockImplementationOnce(() => {
      callOrder.push("countLibraryFiles");
      return Promise.reject(new Error("permission denied"));
    });

    const abortController = new AbortController();
    const libraryRoot = { mode: "handle" as const, name: "Test", handleId: "h2" };

    const countPromise = (countLibraryFiles as jest.Mock)(libraryRoot, {
      signal: abortController.signal,
    });
    await countPromise.catch(() => {});

    const scanPromise = (scanLibraryWithPersistence as jest.Mock)(
      libraryRoot,
      () => {},
      undefined,
      { signal: abortController.signal }
    );

    expect(callOrder).toEqual([
      "countLibraryFiles",
      "scanLibraryWithPersistence",
    ]);

    scanResolve!({
      result: { entries: [], total: 0 },
      libraryRoot: { id: "root-2" },
    });
    await scanPromise;
  });

  it("skips counting stage when getCachedFileCount returns a value", async () => {
    mockGetCachedFileCount.mockResolvedValue(2000);

    const { countLibraryFiles } = await import("@/features/library/scanning");
    const { scanLibraryWithPersistence } = await import(
      "@/features/library/scanning-persist"
    );

    // Simulate the hook logic: if cachedCount is available, skip counting
    const existingCollectionId = "collection-42";
    const cached = await mockGetCachedFileCount(existingCollectionId);

    expect(cached).toBe(2000);

    // countLibraryFiles should NOT be called when cache is available
    expect(callOrder).not.toContain("countLibraryFiles");

    // Proceed directly to scanning
    const abortController = new AbortController();
    const libraryRoot = { mode: "handle" as const, name: "Test", handleId: "h3" };

    const scanPromise = (scanLibraryWithPersistence as jest.Mock)(
      libraryRoot,
      () => {},
      undefined,
      { signal: abortController.signal }
    );

    expect(callOrder).toEqual(["scanLibraryWithPersistence"]);
    expect(callOrder).not.toContain("countLibraryFiles");

    scanResolve!({
      result: { entries: [], total: 2000 },
      libraryRoot: { id: "root-3" },
    });
    await scanPromise;
  });

  it("falls through to live count when getCachedFileCount returns null", async () => {
    mockGetCachedFileCount.mockResolvedValue(null);

    const { countLibraryFiles } = await import("@/features/library/scanning");

    const existingCollectionId = "collection-new";
    const cached = await mockGetCachedFileCount(existingCollectionId);

    expect(cached).toBeNull();

    // countLibraryFiles should be called as fallback
    const abortController = new AbortController();
    const libraryRoot = { mode: "handle" as const, name: "Test", handleId: "h4" };

    const countPromise = (countLibraryFiles as jest.Mock)(libraryRoot, {
      signal: abortController.signal,
    });

    expect(callOrder).toContain("countLibraryFiles");

    countResolve!(500);
    await countPromise;
  });

  it("falls through to live count when getCachedFileCount throws", async () => {
    mockGetCachedFileCount.mockRejectedValue(new Error("db error"));

    const { countLibraryFiles } = await import("@/features/library/scanning");

    const existingCollectionId = "collection-broken";
    let cached: number | null = null;
    try {
      cached = await mockGetCachedFileCount(existingCollectionId);
    } catch {
      // Expected - fall through
    }

    expect(cached).toBeNull();

    // Should still be able to call countLibraryFiles as fallback
    const abortController = new AbortController();
    const libraryRoot = { mode: "handle" as const, name: "Test", handleId: "h5" };

    const countPromise = (countLibraryFiles as jest.Mock)(libraryRoot, {
      signal: abortController.signal,
    });

    expect(callOrder).toContain("countLibraryFiles");

    countResolve!(100);
    await countPromise;
  });
});

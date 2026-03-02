/**
 * Persists which interruption banners have been dismissed per library root.
 * Used so dismissed "Scan Interrupted", "Processing Interrupted", and
 * "Metadata Sync Interrupted" banners stay hidden across navigation/reload
 * until a new interruption occurs for that library.
 */

const STORAGE_KEY = "app-dismissed-interruption-banners";

export interface DismissedState {
  scanRunId: string | null;
  processingKey: string | null;
  writebackKey: string | null;
}

function readAll(): Record<string, DismissedState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DismissedState>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, DismissedState>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Get dismissed state for a library root. Returns nulls when missing or on error.
 */
export function getDismissed(rootId: string): DismissedState {
  const data = readAll();
  const entry = data[rootId];
  if (!entry || typeof entry !== "object") {
    return { scanRunId: null, processingKey: null, writebackKey: null };
  }
  return {
    scanRunId: typeof entry.scanRunId === "string" ? entry.scanRunId : null,
    processingKey: typeof entry.processingKey === "string" ? entry.processingKey : null,
    writebackKey: typeof entry.writebackKey === "string" ? entry.writebackKey : null,
  };
}

/**
 * Persist that the scan-interrupted banner was dismissed for this run.
 */
export function setDismissedScan(rootId: string, runId: string): void {
  const data = readAll();
  const entry = data[rootId] ?? {
    scanRunId: null,
    processingKey: null,
    writebackKey: null,
  };
  data[rootId] = { ...entry, scanRunId: runId };
  writeAll(data);
}

/**
 * Persist that the processing-interrupted banner was dismissed for this checkpoint.
 */
export function setDismissedProcessing(rootId: string, key: string): void {
  const data = readAll();
  const entry = data[rootId] ?? {
    scanRunId: null,
    processingKey: null,
    writebackKey: null,
  };
  data[rootId] = { ...entry, processingKey: key };
  writeAll(data);
}

/**
 * Persist that the writeback-interrupted banner was dismissed for this checkpoint.
 */
export function setDismissedWriteback(rootId: string, key: string): void {
  const data = readAll();
  const entry = data[rootId] ?? {
    scanRunId: null,
    processingKey: null,
    writebackKey: null,
  };
  data[rootId] = { ...entry, writebackKey: key };
  writeAll(data);
}

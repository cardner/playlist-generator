/**
 * Service Worker messaging protocol
 *
 * Typed helpers for communication between main thread and service worker.
 * Covers prewarm, enhancement task orchestration, and cancel/stop flow.
 */

// ---------------------------------------------------------------------------
// Message types (main thread -> SW)
// ---------------------------------------------------------------------------

export interface PrewarmMessage {
  type: "PREWARM_PROCESSING_ASSETS";
}

export interface StartEnhancementMessage {
  type: "START_ENHANCEMENT_TASKS";
  runId: string;
  libraryRootId: string;
  taskCount: number;
}

export interface ResumeEnhancementMessage {
  type: "RESUME_ENHANCEMENT_TASKS";
  runId: string;
}

export interface CancelEnhancementMessage {
  type: "CANCEL_ENHANCEMENT_TASKS";
  runId: string;
  reason: "pause" | "stop";
}

export interface QueryTaskStatusMessage {
  type: "QUERY_TASK_STATUS";
  runId: string;
}

export type SwInboundMessage =
  | PrewarmMessage
  | StartEnhancementMessage
  | ResumeEnhancementMessage
  | CancelEnhancementMessage
  | QueryTaskStatusMessage;

// ---------------------------------------------------------------------------
// Message types (SW -> clients)
// ---------------------------------------------------------------------------

export type EnhancementRunStatus =
  | "idle"
  | "active"
  | "paused"
  | "stopped"
  | "completed"
  | "failed";

export interface EnhancementTasksAck {
  type: "ENHANCEMENT_TASKS_ACK";
  runId: string;
  status: EnhancementRunStatus;
  remaining: number;
  errors: number;
}

export interface TaskStatusResponse {
  type: "TASK_STATUS_RESPONSE";
  runId: string;
  status: EnhancementRunStatus;
  remaining: number;
  succeeded: number;
  errors: number;
}

export type SwOutboundMessage = EnhancementTasksAck | TaskStatusResponse;

// ---------------------------------------------------------------------------
// Enhancement task queue record (stored in IDB by the SW)
// ---------------------------------------------------------------------------

export type EnhancementTaskStatus =
  | "queued"
  | "in-flight"
  | "succeeded"
  | "retry-pending"
  | "paused"
  | "canceled"
  | "failed";

export interface EnhancementTaskRecord {
  taskId: string;
  runId: string;
  libraryRootId: string;
  trackFileId: string;
  /** Type of enhancement work */
  taskType: "musicbrainz-lookup" | "itunes-preview-tempo";
  status: EnhancementTaskStatus;
  retryCount: number;
  /** Earliest time this task may be retried (epoch ms) */
  retryAfter: number;
  createdAt: number;
  updatedAt: number;
  /** Error message from last attempt */
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Enhancement run record (stored in IDB by the SW)
// ---------------------------------------------------------------------------

export interface EnhancementRunRecord {
  runId: string;
  libraryRootId: string;
  status: EnhancementRunStatus;
  totalTasks: number;
  succeeded: number;
  errors: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers for main thread
// ---------------------------------------------------------------------------

/** Send a typed message to the active service worker controller. Returns false if no controller. */
export function postToSw(message: SwInboundMessage): boolean {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !navigator.serviceWorker.controller
  ) {
    return false;
  }
  navigator.serviceWorker.controller.postMessage(message);
  return true;
}

/**
 * Send a message and wait for a specific response type from the SW.
 * Resolves with the response or rejects after `timeoutMs`.
 */
export function postToSwAndWait<T extends SwOutboundMessage>(
  message: SwInboundMessage,
  responseType: T["type"],
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      !navigator.serviceWorker.controller
    ) {
      reject(new Error("No active service worker controller"));
      return;
    }

    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", handler);
      reject(new Error(`SW response timeout for ${responseType}`));
    }, timeoutMs);

    function handler(event: MessageEvent<SwOutboundMessage>) {
      if (event.data?.type === responseType) {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve(event.data as T);
      }
    }

    navigator.serviceWorker.addEventListener("message", handler);
    navigator.serviceWorker.controller.postMessage(message);
  });
}

/** Trigger prewarm of processing assets (fire-and-forget). */
export function prewarmProcessingAssets(): void {
  postToSw({ type: "PREWARM_PROCESSING_ASSETS" });
}

/** Start enhancement tasks for a run. */
export function startEnhancementTasks(
  runId: string,
  libraryRootId: string,
  taskCount: number,
): void {
  postToSw({
    type: "START_ENHANCEMENT_TASKS",
    runId,
    libraryRootId,
    taskCount,
  });
}

/** Cancel or pause enhancement tasks for a run. */
export function cancelEnhancementTasks(
  runId: string,
  reason: "pause" | "stop",
): void {
  postToSw({ type: "CANCEL_ENHANCEMENT_TASKS", runId, reason });
}

/** Resume a paused enhancement run. */
export function resumeEnhancementTasks(runId: string): void {
  postToSw({ type: "RESUME_ENHANCEMENT_TASKS", runId });
}

/** Query task status for a run (with response). */
export async function queryTaskStatus(
  runId: string,
): Promise<TaskStatusResponse> {
  return postToSwAndWait<TaskStatusResponse>(
    { type: "QUERY_TASK_STATUS", runId },
    "TASK_STATUS_RESPONSE",
  );
}

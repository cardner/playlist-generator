"use client";

import { useEffect } from "react";
import { queryTaskStatus } from "@/lib/sw-messaging";
import { logger } from "@/lib/logger";

/**
 * Reconcile orphaned SW enhancement runs on startup.
 * If a run is still "active" with no controlling client, transition to "paused"
 * so the interrupted-scan banner can offer to resume it.
 */
async function reconcileOrphanedRuns(): Promise<void> {
  try {
    const { loadProcessingCheckpoint } = await import(
      "@/db/storage-processing-checkpoints"
    );
    const { db } = await import("@/db/schema");
    const scanRuns = await db.scanRuns?.toArray?.();
    if (!scanRuns?.length) return;

    for (const run of scanRuns) {
      if (!run.id) continue;
      try {
        const checkpoint = await loadProcessingCheckpoint(run.id);
        if (!checkpoint) continue;

        const status = await queryTaskStatus(run.id);
        if (status.status === "active") {
          const { cancelEnhancementTasks } = await import("@/lib/sw-messaging");
          cancelEnhancementTasks(run.id, "pause");
          logger.info(`Paused orphaned SW enhancement run: ${run.id}`);
        }
      } catch {
        // SW may not support the query yet; safe to ignore
      }
    }
  } catch {
    // Non-critical startup reconciliation
  }
}

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        if (!navigator.serviceWorker.controller) {
          const reloaded = sessionStorage.getItem("sw-reload");
          if (!reloaded) {
            sessionStorage.setItem("sw-reload", "true");
            window.location.reload();
          }
        } else {
          sessionStorage.removeItem("sw-reload");
          reconcileOrphanedRuns();
        }
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    };

    const requestPersistentStorage = async () => {
      if (!("storage" in navigator) || typeof navigator.storage.persist !== "function") {
        return;
      }

      try {
        await navigator.storage.persist();
      } catch (error) {
        console.warn("Persistent storage request failed", error);
      }
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      requestPersistentStorage();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
      window.addEventListener("load", requestPersistentStorage, { once: true });
      return () => {
        window.removeEventListener("load", registerServiceWorker);
        window.removeEventListener("load", requestPersistentStorage);
      };
    }
  }, []);

  return null;
}

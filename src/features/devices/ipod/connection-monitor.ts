import { getDirectoryHandle } from "@/lib/library-selection-fs-api";
import { logger } from "@/lib/logger";

type MonitorOptions = {
  handleRef: string;
  pollIntervalMs?: number;
  onDisconnect?: (reason: string) => void;
};

export function startIpodConnectionMonitor(options: MonitorOptions) {
  const { handleRef, pollIntervalMs = 3000, onDisconnect } = options;
  let stopped = false;
  let timer: number | null = null;
  let isSuspended = false;

  async function probe() {
    if (stopped) return;
    if (isSuspended) return;
    try {
      const handle = await getDirectoryHandle(handleRef);
      if (!handle) {
        throw new Error("Device handle missing");
      }
      const control = await handle.getDirectoryHandle("iPod_Control", { create: false });
      const itunes = await control.getDirectoryHandle("iTunes", { create: false });
      await itunes.getFileHandle("iTunesDB", { create: false });
    } catch (error) {
      logger.warn("iPod disconnected", error);
      onDisconnect?.(error instanceof Error ? error.message : "iPod disconnected");
      stop();
    }
  }

  function start() {
    if (timer) return;
    timer = window.setInterval(() => {
      void probe();
    }, pollIntervalMs);
  }

  function suspend() {
    isSuspended = true;
  }

  function resume() {
    isSuspended = false;
  }

  function stop() {
    stopped = true;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  start();
  return { stop, suspend, resume };
}

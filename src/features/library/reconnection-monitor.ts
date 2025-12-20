/**
 * Reconnection Monitor
 * 
 * Monitors network drive reconnection status by polling directory handle access.
 * Used to automatically resume interrupted scans when the network drive reconnects.
 * 
 * @module features/library/reconnection-monitor
 */

import { logger } from "@/lib/logger";

/**
 * Configuration for reconnection monitoring
 */
interface ReconnectionMonitorConfig {
  /** Directory handle to monitor */
  directoryHandle: FileSystemDirectoryHandle;
  /** Callback invoked when reconnection is detected */
  onReconnected: () => void | Promise<void>;
  /** Polling interval in milliseconds (default: 2000ms) */
  pollInterval?: number;
  /** Maximum monitoring duration in milliseconds (default: 5 minutes) */
  maxDuration?: number;
}

/**
 * ReconnectionMonitor class
 * 
 * Polls a directory handle to detect when a network drive reconnects.
 * Automatically stops after a maximum duration or when manually stopped.
 * 
 * @example
 * ```typescript
 * const monitor = new ReconnectionMonitor({
 *   directoryHandle: handle,
 *   onReconnected: async () => {
 *     // Resume scan
 *   },
 *   pollInterval: 2000,
 *   maxDuration: 5 * 60 * 1000
 * });
 * 
 * monitor.startMonitoring();
 * // ... later
 * monitor.stopMonitoring();
 * ```
 */
export class ReconnectionMonitor {
  private config: Required<ReconnectionMonitorConfig>;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private startTime: number = 0;
  private isMonitoring: boolean = false;

  constructor(config: ReconnectionMonitorConfig) {
    this.config = {
      pollInterval: config.pollInterval ?? 2000,
      maxDuration: config.maxDuration ?? 5 * 60 * 1000, // 5 minutes
      directoryHandle: config.directoryHandle,
      onReconnected: config.onReconnected,
    };
  }

  /**
   * Start monitoring for reconnection
   * 
   * Begins polling the directory handle every `pollInterval` milliseconds.
   * Automatically stops after `maxDuration` milliseconds.
   * 
   * @throws Error if already monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      throw new Error("ReconnectionMonitor is already monitoring");
    }

    this.isMonitoring = true;
    this.startTime = Date.now();

    logger.info(
      `Starting reconnection monitoring (max duration: ${this.config.maxDuration}ms, poll interval: ${this.config.pollInterval}ms)`
    );

    // Set timeout to stop monitoring after max duration
    this.timeoutId = setTimeout(() => {
      logger.info("Reconnection monitoring timeout reached, stopping");
      this.stopMonitoring();
    }, this.config.maxDuration);

    // Start polling
    this.pollIntervalId = setInterval(async () => {
      await this.checkReconnection();
    }, this.config.pollInterval);
  }

  /**
   * Stop monitoring for reconnection
   * 
   * Stops polling and clears all timers. Safe to call multiple times.
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const duration = Date.now() - this.startTime;
    logger.info(`Stopped reconnection monitoring (duration: ${duration}ms)`);
  }

  /**
   * Check if currently monitoring
   * 
   * @returns True if monitoring is active
   */
  getIsMonitoring(): boolean {
    return this.isMonitoring;
  }

  /**
   * Get elapsed monitoring time in milliseconds
   * 
   * @returns Elapsed time since monitoring started, or 0 if not monitoring
   */
  getElapsedTime(): number {
    if (!this.isMonitoring || this.startTime === 0) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Check if directory handle is accessible (reconnected)
   * 
   * Attempts to access the directory handle. If successful, invokes
   * the `onReconnected` callback and stops monitoring.
   * 
   * @private
   */
  private async checkReconnection(): Promise<void> {
    try {
      // Try to access the directory handle
      // This will throw if the drive is still disconnected
      await this.config.directoryHandle.getDirectoryHandle(".", { create: false });
      
      // If we get here, the drive is reconnected!
      logger.info("Network drive reconnection detected");
      
      // Stop monitoring before invoking callback
      this.stopMonitoring();
      
      // Invoke reconnection callback
      try {
        await this.config.onReconnected();
      } catch (error) {
        logger.error("Error in onReconnected callback:", error);
        // Don't re-throw - monitoring is stopped, let caller handle
      }
    } catch (error) {
      // Drive is still disconnected, continue monitoring
      if (error instanceof DOMException && error.name === "NotFoundError") {
        // Expected - drive still disconnected
        const elapsed = this.getElapsedTime();
        logger.debug(
          `Network drive still disconnected (elapsed: ${elapsed}ms / ${this.config.maxDuration}ms)`
        );
      } else {
        // Unexpected error
        logger.warn("Unexpected error checking reconnection:", error);
      }
    }
  }
}


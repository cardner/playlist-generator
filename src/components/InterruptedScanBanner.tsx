/**
 * InterruptedScanBanner Component
 * 
 * Displays a banner when a scan has been interrupted due to network drive
 * disconnection, showing reconnection status and providing options to cancel
 * auto-resume or manually resume the scan.
 * 
 * @module components/InterruptedScanBanner
 */

"use client";

export interface InterruptedScanBannerProps {
  /** Whether reconnection monitoring is currently active */
  isMonitoringReconnection: boolean;
  /** ID of the interrupted scan run */
  interruptedScanRunId: string | null;
  /** Callback to cancel auto-resume monitoring */
  onCancelAutoResume: () => void;
  /** Callback to manually resume the scan */
  onManualResume: (scanRunId: string) => void;
}

/**
 * InterruptedScanBanner component
 * 
 * Shows a banner when a scan is interrupted, displaying reconnection status
 * and providing options to cancel auto-resume or manually resume.
 * 
 * @example
 * ```tsx
 * <InterruptedScanBanner
 *   isMonitoringReconnection={true}
 *   interruptedScanRunId="scan-123"
 *   onCancelAutoResume={() => cancelMonitoring()}
 *   onManualResume={(id) => resumeScan(id)}
 * />
 * ```
 */
export function InterruptedScanBanner({
  isMonitoringReconnection,
  interruptedScanRunId,
  onCancelAutoResume,
  onManualResume,
}: InterruptedScanBannerProps) {
  if (!interruptedScanRunId) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-yellow-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            Scan Interrupted
          </h3>
          <div className="mt-2 text-sm text-yellow-700">
            {isMonitoringReconnection ? (
              <>
                <p>
                  Network drive disconnected during scan. Monitoring for
                  reconnection and will automatically resume when the drive is
                  available again.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={onCancelAutoResume}
                    className="inline-flex items-center px-3 py-1.5 border border-yellow-300 shadow-sm text-sm font-medium rounded text-yellow-800 bg-white hover:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                  >
                    Cancel Auto-Resume
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Previous scan was interrupted. You can resume from where it
                  left off.
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => onManualResume(interruptedScanRunId)}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                  >
                    Resume Previous Scan
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


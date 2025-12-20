/**
 * Network Drive Error Types
 * 
 * This module defines custom error types for network drive disconnection
 * scenarios, allowing the application to distinguish between temporary
 * network issues and other types of errors.
 * 
 * @module features/library/network-drive-errors
 */

/**
 * Error thrown when a network drive disconnection is detected
 * 
 * This error is thrown when 3+ consecutive NotFoundError failures occur
 * during directory traversal, indicating the network drive has likely
 * disconnected rather than just having a few inaccessible files.
 * 
 * @example
 * ```typescript
 * try {
 *   // Scan network drive
 * } catch (error) {
 *   if (isNetworkDriveDisconnectedError(error)) {
 *     // Handle disconnection: save checkpoint, start monitoring
 *   }
 * }
 * ```
 */
export class NetworkDriveDisconnectedError extends Error {
  /** ID of the scan run that was interrupted */
  scanRunId: string;
  /** Last file path that was successfully scanned */
  lastScannedPath?: string;
  /** Number of files scanned before disconnection */
  scannedCount: number;

  constructor(
    message: string,
    scanRunId: string,
    scannedCount: number,
    lastScannedPath?: string
  ) {
    super(message);
    this.name = "NetworkDriveDisconnectedError";
    this.scanRunId = scanRunId;
    this.scannedCount = scannedCount;
    this.lastScannedPath = lastScannedPath;
    Object.setPrototypeOf(this, NetworkDriveDisconnectedError.prototype);
  }
}

/**
 * Type guard to check if an error is a NetworkDriveDisconnectedError
 * 
 * @param error - Error to check
 * @returns True if error is a NetworkDriveDisconnectedError
 * 
 * @example
 * ```typescript
 * if (isNetworkDriveDisconnectedError(error)) {
 *   console.log(`Scan ${error.scanRunId} interrupted at ${error.scannedCount} files`);
 * }
 * ```
 */
export function isNetworkDriveDisconnectedError(
  error: unknown
): error is NetworkDriveDisconnectedError {
  return (
    error instanceof NetworkDriveDisconnectedError ||
    (error instanceof Error &&
      error.name === "NetworkDriveDisconnectedError" &&
      "scanRunId" in error &&
      "scannedCount" in error)
  );
}


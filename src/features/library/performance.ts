/**
 * Performance monitoring and timing utilities
 * 
 * Measures and logs timings for scan runs and other operations
 */

export interface PerformanceMetrics {
  operation: string;
  duration: number; // milliseconds
  metadata?: Record<string, any>;
  timestamp: number;
}

class PerformanceLogger {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics

  /**
   * Log a performance metric
   */
  log(operation: string, duration: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetrics = {
      operation,
      duration,
      metadata,
      timestamp: Date.now(),
    };

    this.metrics.push(metric);

    // Keep only last maxMetrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[Performance] ${operation}: ${duration.toFixed(2)}ms`, metadata || "");
    }
  }

  /**
   * Get metrics for a specific operation
   */
  getMetrics(operation: string): PerformanceMetrics[] {
    return this.metrics.filter((m) => m.operation === operation);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get summary statistics for an operation
   */
  getSummary(operation: string): {
    count: number;
    total: number;
    average: number;
    min: number;
    max: number;
  } | null {
    const operationMetrics = this.getMetrics(operation);
    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics.map((m) => m.duration);
    const total = durations.reduce((sum, d) => sum + d, 0);
    const average = total / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    return {
      count: operationMetrics.length,
      total,
      average,
      min,
      max,
    };
  }
}

export const performanceLogger = new PerformanceLogger();

/**
 * Measure execution time of an async function
 */
export async function measureAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    performanceLogger.log(operation, duration, {
      ...metadata,
      success: true,
    });
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    performanceLogger.log(operation, duration, {
      ...metadata,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Measure execution time of a sync function
 */
export function measureSync<T>(
  operation: string,
  fn: () => T,
  metadata?: Record<string, any>
): T {
  const startTime = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - startTime;
    performanceLogger.log(operation, duration, {
      ...metadata,
      success: true,
    });
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    performanceLogger.log(operation, duration, {
      ...metadata,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Create a performance timer for multi-step operations
 */
export class PerformanceTimer {
  private startTime: number;
  private steps: Array<{ name: string; time: number }> = [];
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = performance.now();
  }

  /**
   * Mark a step in the operation
   */
  step(name: string): void {
    const now = performance.now();
    const elapsed = now - this.startTime;
    this.steps.push({ name, time: elapsed });
  }

  /**
   * Finish timing and log results
   */
  finish(metadata?: Record<string, any>): void {
    const totalDuration = performance.now() - this.startTime;
    performanceLogger.log(this.operation, totalDuration, {
      ...metadata,
      steps: this.steps,
    });
  }
}


/**
 * Feature flags for incremental rollout of SW enhancements
 *
 * Stored in localStorage, each flag defaults to `false` (disabled).
 * Enable via browser console: `setFeatureFlag("swPrewarm", true)`
 */

import { logger } from "./logger";

export interface FeatureFlags {
  /** Phase 2: prewarm worker assets via SW at scan start */
  swPrewarm: boolean;
  /** Phase 3: SW caches MusicBrainz / iTunes API responses */
  swApiCaching: boolean;
  /** Phase 4: background-sync queue for enhancement retries */
  swBackgroundSync: boolean;
}

const STORAGE_KEY = "feature-flags";

const defaults: FeatureFlags = {
  swPrewarm: false,
  swApiCaching: false,
  swBackgroundSync: false,
};

export function getFeatureFlags(): FeatureFlags {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...defaults, ...JSON.parse(raw) };
    }
  } catch (err) {
    logger.error("Failed to read feature flags:", err);
  }
  return { ...defaults };
}

export function setFeatureFlag<K extends keyof FeatureFlags>(
  key: K,
  value: FeatureFlags[K],
): void {
  const flags = getFeatureFlags();
  flags[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (err) {
    logger.error("Failed to save feature flag:", err);
  }
}

export function isFeatureEnabled(key: keyof FeatureFlags): boolean {
  return getFeatureFlags()[key];
}

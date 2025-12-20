/**
 * Privacy and feature settings
 * 
 * These settings control what features are enabled and what data
 * can be sent to external services (like LLMs).
 */

import { logger } from "./logger";

export interface AppSettings {
  /**
   * Whether LLM integration is enabled at all
   * Default: false (privacy-first)
   */
  allowLLM: boolean;

  /**
   * Whether track names can be sent to LLM
   * Default: false (privacy-first)
   * Even if allowLLM is true, this must be explicitly enabled
   */
  allowSendingTrackNamesToLLM: boolean;
}

/**
 * Default settings (privacy-first)
 */
export const defaultSettings: AppSettings = {
  allowLLM: false,
  allowSendingTrackNamesToLLM: false,
};

/**
 * Get current settings from localStorage or return defaults
 * 
 * @returns Current app settings
 */
export function getSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const stored = localStorage.getItem("app-settings");
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AppSettings>;
      return {
        ...defaultSettings,
        ...parsed,
      };
    }
  } catch (error) {
    logger.error("Failed to load settings:", error);
  }

  return defaultSettings;
}

/**
 * Save settings to localStorage
 * 
 * @param settings Settings to save
 */
export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem("app-settings", JSON.stringify(settings));
  } catch (error) {
    logger.error("Failed to save settings:", error);
  }
}

/**
 * Update a specific setting
 * 
 * @param key Setting key to update
 * @param value New value
 */
export function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): void {
  const settings = getSettings();
  settings[key] = value;
  saveSettings(settings);
}


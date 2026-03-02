/**
 * Tests for feature flag utilities
 */

import {
  getFeatureFlags,
  setFeatureFlag,
  isFeatureEnabled,
} from "@/lib/feature-flags";

const STORAGE_KEY = "feature-flags";

beforeEach(() => {
  localStorage.clear();
});

describe("getFeatureFlags", () => {
  it("returns defaults when nothing stored", () => {
    const flags = getFeatureFlags();
    expect(flags).toEqual({
      swPrewarm: false,
      swApiCaching: false,
      swBackgroundSync: false,
    });
  });

  it("merges stored values with defaults", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ swPrewarm: true }));
    const flags = getFeatureFlags();
    expect(flags.swPrewarm).toBe(true);
    expect(flags.swApiCaching).toBe(false);
    expect(flags.swBackgroundSync).toBe(false);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json");
    const flags = getFeatureFlags();
    expect(flags).toEqual({
      swPrewarm: false,
      swApiCaching: false,
      swBackgroundSync: false,
    });
  });
});

describe("setFeatureFlag", () => {
  it("persists a flag to localStorage", () => {
    setFeatureFlag("swApiCaching", true);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.swApiCaching).toBe(true);
  });

  it("preserves other flags when setting one", () => {
    setFeatureFlag("swPrewarm", true);
    setFeatureFlag("swBackgroundSync", true);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.swPrewarm).toBe(true);
    expect(stored.swBackgroundSync).toBe(true);
  });
});

describe("isFeatureEnabled", () => {
  it("returns false by default", () => {
    expect(isFeatureEnabled("swPrewarm")).toBe(false);
  });

  it("returns true after enabling", () => {
    setFeatureFlag("swPrewarm", true);
    expect(isFeatureEnabled("swPrewarm")).toBe(true);
  });
});

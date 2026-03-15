import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  getDismissed,
  setDismissedScan,
  setDismissedProcessing,
  setDismissedWriteback,
  setDismissedUnprocessedBanner,
} from "@/lib/dismissed-interruption-storage";

const STORAGE_KEY = "app-dismissed-interruption-banners";

describe("dismissed-interruption-storage", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  describe("getDismissed", () => {
    it("returns nulls when storage is empty", () => {
      expect(getDismissed("root-1")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
        unprocessedBannerDismissed: false,
      });
    });

    it("returns nulls for unknown rootId", () => {
      setDismissedScan("root-1", "run-1");
      expect(getDismissed("root-2")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
        unprocessedBannerDismissed: false,
      });
    });

    it("returns stored values after set", () => {
      setDismissedScan("root-1", "run-1");
      setDismissedProcessing("root-1", "lib1-scan1");
      setDismissedWriteback("root-1", "lib1-wb1");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: "run-1",
        processingKey: "lib1-scan1",
        writebackKey: "lib1-wb1",
        unprocessedBannerDismissed: false,
      });
    });

    it("returns nulls when JSON is invalid", () => {
      localStorage.setItem(STORAGE_KEY, "not json");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
        unprocessedBannerDismissed: false,
      });
    });

    it("returns nulls when stored value is not an object", () => {
      localStorage.setItem(STORAGE_KEY, "[]");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
        unprocessedBannerDismissed: false,
      });
    });

    it("coerces non-string entry fields to null", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          "root-1": {
            scanRunId: 123,
            processingKey: null,
            writebackKey: undefined,
          },
        })
      );
      expect(getDismissed("root-1")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
        unprocessedBannerDismissed: false,
      });
    });
  });

  describe("setDismissedScan", () => {
    it("persists and is returned by getDismissed", () => {
      setDismissedScan("root-1", "run-1");
      expect(getDismissed("root-1").scanRunId).toBe("run-1");
    });

    it("does not overwrite other keys for same root", () => {
      setDismissedProcessing("root-1", "lib1-scan1");
      setDismissedWriteback("root-1", "lib1-wb1");
      setDismissedScan("root-1", "run-1");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: "run-1",
        processingKey: "lib1-scan1",
        writebackKey: "lib1-wb1",
        unprocessedBannerDismissed: false,
      });
    });
  });

  describe("setDismissedProcessing", () => {
    it("persists and is returned by getDismissed", () => {
      setDismissedProcessing("root-1", "lib1-scan1");
      expect(getDismissed("root-1").processingKey).toBe("lib1-scan1");
    });

    it("does not overwrite other keys for same root", () => {
      setDismissedScan("root-1", "run-1");
      setDismissedWriteback("root-1", "lib1-wb1");
      setDismissedProcessing("root-1", "lib1-scan1");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: "run-1",
        processingKey: "lib1-scan1",
        writebackKey: "lib1-wb1",
        unprocessedBannerDismissed: false,
      });
    });
  });

  describe("setDismissedWriteback", () => {
    it("persists and is returned by getDismissed", () => {
      setDismissedWriteback("root-1", "lib1-wb1");
      expect(getDismissed("root-1").writebackKey).toBe("lib1-wb1");
    });

    it("does not overwrite other keys for same root", () => {
      setDismissedScan("root-1", "run-1");
      setDismissedProcessing("root-1", "lib1-scan1");
      setDismissedWriteback("root-1", "lib1-wb1");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: "run-1",
        processingKey: "lib1-scan1",
        writebackKey: "lib1-wb1",
        unprocessedBannerDismissed: false,
      });
    });
  });

  describe("setDismissedUnprocessedBanner", () => {
    it("persists and is returned by getDismissed", () => {
      setDismissedUnprocessedBanner("root-1");
      expect(getDismissed("root-1").unprocessedBannerDismissed).toBe(true);
    });

    it("does not overwrite other keys for same root", () => {
      setDismissedScan("root-1", "run-1");
      setDismissedProcessing("root-1", "lib1-scan1");
      setDismissedUnprocessedBanner("root-1");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: "run-1",
        processingKey: "lib1-scan1",
        writebackKey: null,
        unprocessedBannerDismissed: true,
      });
    });
  });

  describe("multiple rootIds", () => {
    it("does not overwrite each other", () => {
      setDismissedScan("root-1", "run-1");
      setDismissedProcessing("root-1", "lib1-scan1");
      setDismissedScan("root-2", "run-2");
      setDismissedWriteback("root-2", "lib2-wb2");

      expect(getDismissed("root-1")).toEqual({
        scanRunId: "run-1",
        processingKey: "lib1-scan1",
        writebackKey: null,
        unprocessedBannerDismissed: false,
      });
      expect(getDismissed("root-2")).toEqual({
        scanRunId: "run-2",
        processingKey: null,
        writebackKey: "lib2-wb2",
        unprocessedBannerDismissed: false,
      });
    });
  });
});

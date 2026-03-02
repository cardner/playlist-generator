import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  getDismissed,
  setDismissedScan,
  setDismissedProcessing,
  setDismissedWriteback,
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
      });
    });

    it("returns nulls for unknown rootId", () => {
      setDismissedScan("root-1", "run-1");
      expect(getDismissed("root-2")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
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
      });
    });

    it("returns nulls when JSON is invalid", () => {
      localStorage.setItem(STORAGE_KEY, "not json");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
      });
    });

    it("returns nulls when stored value is not an object", () => {
      localStorage.setItem(STORAGE_KEY, "[]");
      expect(getDismissed("root-1")).toEqual({
        scanRunId: null,
        processingKey: null,
        writebackKey: null,
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
      });
      expect(getDismissed("root-2")).toEqual({
        scanRunId: "run-2",
        processingKey: null,
        writebackKey: "lib2-wb2",
      });
    });
  });
});

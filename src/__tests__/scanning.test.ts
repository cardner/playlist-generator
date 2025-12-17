/**
 * Tests for library scanning and diffing
 */

import { describe, it, expect } from "@jest/globals";
import { diffFileIndex, type FileIndex } from "@/features/library/scanning";
import {
  generateSampleFileIndexEntries,
  generateLargeDataset,
} from "./fixtures/metadata";

describe("diffFileIndex", () => {
  it("should detect added files", () => {
    const prev = new Map<string, any>();
    const next = new Map<string, any>();
    
    const entry1 = generateSampleFileIndexEntries(1)[0];
    const entry2 = generateSampleFileIndexEntries(1)[0];
    entry2.trackFileId = "new-track";
    
    next.set(entry1.trackFileId, entry1);
    next.set(entry2.trackFileId, entry2);
    
    const diff = diffFileIndex(prev, next);
    
    expect(diff.added).toHaveLength(2);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("should detect changed files", () => {
    const prev = new Map<string, any>();
    const next = new Map<string, any>();
    
    const entry1 = generateSampleFileIndexEntries(1)[0];
    const entry2 = { ...entry1, size: entry1.size + 1000 }; // Changed size
    
    prev.set(entry1.trackFileId, entry1);
    next.set(entry2.trackFileId, entry2);
    
    const diff = diffFileIndex(prev, next);
    
    expect(diff.added).toHaveLength(0);
    expect(diff.changed).toHaveLength(1);
    expect(diff.removed).toHaveLength(0);
  });

  it("should detect removed files", () => {
    const prev = new Map<string, any>();
    const next = new Map<string, any>();
    
    const entry1 = generateSampleFileIndexEntries(1)[0];
    const entry2 = generateSampleFileIndexEntries(1)[0];
    entry2.trackFileId = "another-track";
    
    prev.set(entry1.trackFileId, entry1);
    prev.set(entry2.trackFileId, entry2);
    next.set(entry1.trackFileId, entry1);
    
    const diff = diffFileIndex(prev, next);
    
    expect(diff.added).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].trackFileId).toBe(entry2.trackFileId);
  });

  it("should handle empty indexes", () => {
    const prev = new Map<string, any>();
    const next = new Map<string, any>();
    
    const diff = diffFileIndex(prev, next);
    
    expect(diff.added).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("should handle large datasets efficiently", () => {
    const { fileIndex } = generateLargeDataset(10000);
    
    const prev = new Map<string, any>();
    const next = new Map<string, any>();
    
    // Add first half to prev, all to next
    for (let i = 0; i < fileIndex.length; i++) {
      if (i < fileIndex.length / 2) {
        prev.set(fileIndex[i].trackFileId, fileIndex[i]);
      }
      next.set(fileIndex[i].trackFileId, fileIndex[i]);
    }
    
    const startTime = performance.now();
    const diff = diffFileIndex(prev, next);
    const endTime = performance.now();
    
    expect(diff.added).toHaveLength(fileIndex.length / 2);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    
    // Should complete in reasonable time (< 100ms for 10k files)
    expect(endTime - startTime).toBeLessThan(100);
  });

  it("should detect changes in mtime", () => {
    const prev = new Map<string, any>();
    const next = new Map<string, any>();
    
    const entry1 = generateSampleFileIndexEntries(1)[0];
    const entry2 = { ...entry1, mtime: entry1.mtime + 1000 }; // Changed mtime
    
    prev.set(entry1.trackFileId, entry1);
    next.set(entry2.trackFileId, entry2);
    
    const diff = diffFileIndex(prev, next);
    
    expect(diff.changed).toHaveLength(1);
  });

  it("should not detect changes if only unrelated properties differ", () => {
    const prev = new Map<string, any>();
    const next = new Map<string, any>();
    
    const entry1 = generateSampleFileIndexEntries(1)[0];
    const entry2 = { ...entry1, name: "Different Name" }; // Only name changed
    
    prev.set(entry1.trackFileId, entry1);
    next.set(entry2.trackFileId, entry2);
    
    const diff = diffFileIndex(prev, next);
    
    // Should not be detected as changed (only size/mtime matter)
    expect(diff.changed).toHaveLength(0);
  });
});


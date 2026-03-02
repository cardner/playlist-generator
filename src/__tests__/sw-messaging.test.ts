/**
 * Tests for SW messaging protocol helpers
 */

import {
  postToSw,
  prewarmProcessingAssets,
  cancelEnhancementTasks,
  startEnhancementTasks,
  resumeEnhancementTasks,
  type SwInboundMessage,
} from "@/lib/sw-messaging";

const mockPostMessage = jest.fn();

function setupController() {
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      controller: { postMessage: mockPostMessage },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    writable: true,
    configurable: true,
  });
}

function clearController() {
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      controller: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  mockPostMessage.mockClear();
});

describe("postToSw", () => {
  it("returns false when no SW controller", () => {
    clearController();
    const result = postToSw({ type: "PREWARM_PROCESSING_ASSETS" });
    expect(result).toBe(false);
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it("sends message and returns true with active controller", () => {
    setupController();
    const msg: SwInboundMessage = { type: "PREWARM_PROCESSING_ASSETS" };
    const result = postToSw(msg);
    expect(result).toBe(true);
    expect(mockPostMessage).toHaveBeenCalledWith(msg);
  });
});

describe("prewarmProcessingAssets", () => {
  it("posts PREWARM_PROCESSING_ASSETS to SW", () => {
    setupController();
    prewarmProcessingAssets();
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "PREWARM_PROCESSING_ASSETS",
    });
  });
});

describe("cancelEnhancementTasks", () => {
  it("posts CANCEL with stop reason and runId", () => {
    setupController();
    cancelEnhancementTasks("run-1", "stop");
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "CANCEL_ENHANCEMENT_TASKS",
      runId: "run-1",
      reason: "stop",
    });
  });

  it("posts CANCEL with pause reason and runId", () => {
    setupController();
    cancelEnhancementTasks("run-2", "pause");
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "CANCEL_ENHANCEMENT_TASKS",
      runId: "run-2",
      reason: "pause",
    });
  });
});

describe("startEnhancementTasks", () => {
  it("posts START with runId, libraryRootId, and taskCount", () => {
    setupController();
    startEnhancementTasks("run-3", "lib-1", 42);
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "START_ENHANCEMENT_TASKS",
      runId: "run-3",
      libraryRootId: "lib-1",
      taskCount: 42,
    });
  });
});

describe("resumeEnhancementTasks", () => {
  it("posts RESUME with runId", () => {
    setupController();
    resumeEnhancementTasks("run-4");
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: "RESUME_ENHANCEMENT_TASKS",
      runId: "run-4",
    });
  });
});

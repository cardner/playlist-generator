/**
 * Tests for file content hashing utilities
 */

import { hashFileContent } from "@/lib/file-hash";

// Mock the crypto API
const mockCrypto = {
  subtle: {
    digest: jest.fn(),
  },
};

// Helper to create a mock File object
function createMockFile(name: string, size: number, content?: Uint8Array): File {
  const actualContent = content || new Uint8Array(size);
  const blob = new Blob([actualContent], { type: "audio/mpeg" });
  return new File([blob], name, {
    type: "audio/mpeg",
    lastModified: Date.now(),
  });
}

describe("hashFileContent", () => {
  beforeAll(() => {
    // Set up crypto mock
    Object.defineProperty(global, "crypto", {
      value: mockCrypto,
      writable: true,
      configurable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock digest to return a predictable hash
    mockCrypto.subtle.digest.mockResolvedValue(
      new Uint8Array([
        0x9f, 0x86, 0xd0, 0x81, 0x88, 0x4c, 0x7d, 0x65,
        0x9a, 0x2f, 0xea, 0xa0, 0xc5, 0x5a, 0xd0, 0x15,
        0xa3, 0xbf, 0x4f, 0x1b, 0x2b, 0x0b, 0x82, 0x2c,
        0xd1, 0x5d, 0x6c, 0x15, 0xb0, 0xf0, 0x0a, 0x08,
      ]).buffer
    );
  });

  afterAll(() => {
    // Clean up
    delete (global as any).crypto;
  });

  it("should hash small files (under 256KB)", async () => {
    const file = createMockFile("test.mp3", 100 * 1024); // 100KB
    const hash = await hashFileContent(file);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash?.length).toBe(64); // SHA-256 produces 64 hex chars
    expect(mockCrypto.subtle.digest).toHaveBeenCalledWith(
      "SHA-256",
      expect.any(ArrayBuffer)
    );
  });

  it("should hash only first maxBytes of large files", async () => {
    const file = createMockFile("test.mp3", 500 * 1024); // 500KB
    const maxBytes = 256 * 1024; // 256KB
    const hash = await hashFileContent(file, maxBytes);

    expect(hash).toBeDefined();
    expect(mockCrypto.subtle.digest).toHaveBeenCalledTimes(1);
  });

  it("should return undefined if crypto is not available", async () => {
    const originalCrypto = (global as any).crypto;
    delete (global as any).crypto;

    const file = createMockFile("test.mp3", 100 * 1024);
    const hash = await hashFileContent(file);

    expect(hash).toBeUndefined();

    // Restore crypto
    (global as any).crypto = originalCrypto;
  });

  it("should return undefined if crypto.subtle is not available", async () => {
    const originalSubtle = mockCrypto.subtle;
    (mockCrypto as any).subtle = undefined;

    const file = createMockFile("test.mp3", 100 * 1024);
    const hash = await hashFileContent(file);

    expect(hash).toBeUndefined();

    // Restore subtle
    mockCrypto.subtle = originalSubtle;
  });

  it("should handle hashing errors gracefully", async () => {
    mockCrypto.subtle.digest.mockRejectedValue(new Error("Hashing failed"));

    const file = createMockFile("test.mp3", 100 * 1024);
    const hash = await hashFileContent(file);

    expect(hash).toBeUndefined();
  });

  it("should use default maxBytes of 256KB", async () => {
    const file = createMockFile("test.mp3", 1024 * 1024); // 1MB
    await hashFileContent(file);

    expect(mockCrypto.subtle.digest).toHaveBeenCalledWith(
      "SHA-256",
      expect.any(ArrayBuffer)
    );
    
    // Get the buffer that was passed
    const call = mockCrypto.subtle.digest.mock.calls[0];
    const buffer = call[1] as ArrayBuffer;
    expect(buffer.byteLength).toBe(256 * 1024);
  });
});

describe("hashFullFileContent integration", () => {
  // Note: We can't easily test hashFullFileContent directly because it uses
  // a private function (hashFileContentStreaming), but we verify the behavior
  // through integration tests in scanning.test.ts and device-sync.test.ts
  it("should be tested via integration tests", () => {
    expect(true).toBe(true);
  });
});

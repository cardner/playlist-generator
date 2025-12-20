/**
 * API Key Storage Utilities
 * 
 * This module provides secure storage for API keys using client-side encryption.
 * Keys are encrypted using AES-GCM before being stored in localStorage, and decrypted
 * when needed. SHA-256 hashing is used for verification.
 * 
 * Security Features:
 * - AES-GCM encryption with 256-bit keys
 * - PBKDF2 key derivation (100,000 iterations)
 * - Random salt and IV for each encryption
 * - SHA-256 hashing for verification
 * 
 * Storage:
 * - Keys are stored in localStorage with prefix "api_key_"
 * - Each key is encrypted separately with its own salt/IV
 * 
 * Limitations:
 * - This provides basic client-side encryption only
 * - For production use, consider server-side key management
 * - Keys are still vulnerable to XSS attacks if the app is compromised
 * 
 * @module lib/api-key-storage
 * 
 * @example
 * ```typescript
 * // Store an API key
 * await storeApiKey('openai', 'sk-...');
 * 
 * // Retrieve an API key
 * const key = await getApiKey('openai');
 * 
 * // Check if a key exists
 * const exists = await hasApiKey('openai');
 * 
 * // Delete a key
 * await deleteApiKey('openai');
 * ```
 */

import { logger } from "./logger";

const STORAGE_KEY_PREFIX = "api_key_";
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16; // 128 bits

/**
 * Derive an encryption key from a password using PBKDF2
 * 
 * Uses PBKDF2 with SHA-256 and 100,000 iterations to derive a 256-bit AES-GCM key.
 * This provides strong key derivation resistant to brute-force attacks.
 * 
 * @param password - Password to derive key from
 * @param salt - Random salt for key derivation
 * @returns Derived encryption key
 * @internal
 */
async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Generate a SHA-256 hash of the API key for verification
 * 
 * Creates a hexadecimal hash string that can be used to verify the key
 * without storing the plaintext key.
 * 
 * @param apiKey - API key to hash
 * @returns Hexadecimal hash string
 * @internal
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Encrypt an API key using AES-GCM
 * 
 * Encrypts the API key with a random salt and IV. The encrypted data,
 * salt, and IV are combined into a single base64-encoded string.
 * 
 * @param apiKey - Plaintext API key to encrypt
 * @param password - Password for encryption
 * @returns Base64-encoded encrypted key (salt + IV + encrypted data)
 * @internal
 */
async function encryptApiKey(apiKey: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);

  // Generate salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key
  const key = await deriveKey(password, salt);

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data
  );

  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  // Convert to base64 for storage
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an API key using AES-GCM
 * 
 * Extracts the salt and IV from the encrypted string, derives the key,
 * and decrypts the API key.
 * 
 * @param encrypted - Base64-encoded encrypted key (salt + IV + encrypted data)
 * @param password - Password for decryption
 * @returns Plaintext API key
 * @throws Error if decryption fails (corrupted data or wrong password)
 * @internal
 */
async function decryptApiKey(encrypted: string, password: string): Promise<string> {
  try {
    // Decode from base64
    const combined: Uint8Array = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // Extract salt, IV, and encrypted data
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encryptedData = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Derive key
    const key = await deriveKey(password, salt);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error("Failed to decrypt API key. The key may be corrupted or the password incorrect.");
  }
}

/**
 * Get a device-specific password for encryption
 * 
 * Generates a password based on browser properties (user agent, language, etc.)
 * This ensures keys are encrypted with a device-specific key, making them
 * harder to extract if localStorage is accessed directly.
 * 
 * Note: This is not cryptographically secure but provides basic obfuscation.
 * 
 * @returns Device-specific password string
 * @internal
 */
function getDevicePassword(): string {
  // Use a combination of browser properties to create a device-specific key
  // This is not perfect security, but provides basic protection
  const userAgent = navigator.userAgent;
  const language = navigator.language;
  const platform = navigator.platform;
  
  // In a real app, you might want to use a more secure method
  // For now, we'll use a simple combination
  return `${userAgent}-${language}-${platform}-api-key-storage`;
}

/**
 * Store API key for a provider
 */
export async function storeApiKey(provider: string, apiKey: string): Promise<void> {
  const password = getDevicePassword();
  const encrypted = await encryptApiKey(apiKey, password);
  const hash = await hashApiKey(apiKey);

  const storageKey = `${STORAGE_KEY_PREFIX}${provider}`;
  const hashKey = `${STORAGE_KEY_PREFIX}${provider}_hash`;

  localStorage.setItem(storageKey, encrypted);
  localStorage.setItem(hashKey, hash);
}

/**
 * Retrieve API key for a provider
 */
export async function getApiKey(provider: string): Promise<string | null> {
  const storageKey = `${STORAGE_KEY_PREFIX}${provider}`;
  const encrypted = localStorage.getItem(storageKey);

  if (!encrypted) {
    return null;
  }

  try {
    const password = getDevicePassword();
    const decrypted = await decryptApiKey(encrypted, password);
    return decrypted;
  } catch (error) {
    logger.error(`Failed to decrypt API key for ${provider}:`, error);
    return null;
  }
}

/**
 * Get API key hash for verification (without decrypting)
 */
export function getApiKeyHash(provider: string): string | null {
  const hashKey = `${STORAGE_KEY_PREFIX}${provider}_hash`;
  return localStorage.getItem(hashKey);
}

/**
 * Verify API key matches stored hash
 */
export async function verifyApiKey(provider: string, apiKey: string): Promise<boolean> {
  const storedHash = getApiKeyHash(provider);
  if (!storedHash) {
    return false;
  }

  const computedHash = await hashApiKey(apiKey);
  return storedHash === computedHash;
}

/**
 * Delete API key for a provider
 */
export function deleteApiKey(provider: string): void {
  const storageKey = `${STORAGE_KEY_PREFIX}${provider}`;
  const hashKey = `${STORAGE_KEY_PREFIX}${provider}_hash`;

  localStorage.removeItem(storageKey);
  localStorage.removeItem(hashKey);
}

/**
 * Check if API key exists for a provider
 */
export function hasApiKey(provider: string): boolean {
  const storageKey = `${STORAGE_KEY_PREFIX}${provider}`;
  return localStorage.getItem(storageKey) !== null;
}


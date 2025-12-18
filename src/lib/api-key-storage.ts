/**
 * API Key Storage Utilities
 * 
 * Stores API keys securely using encryption (AES-GCM) and SHA-256 hashing for verification.
 * Keys are encrypted before storage and decrypted when needed.
 * 
 * Note: This provides basic client-side encryption. For production use, consider
 * server-side key management or more sophisticated encryption schemes.
 */

const STORAGE_KEY_PREFIX = "api_key_";
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16; // 128 bits

/**
 * Generate a key from a password using PBKDF2
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
 * Generate a hash of the API key for verification
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Encrypt API key
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
 * Decrypt API key
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
 * Uses a combination of user agent and other browser properties
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
    console.error(`Failed to decrypt API key for ${provider}:`, error);
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


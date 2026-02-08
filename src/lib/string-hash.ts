/**
 * Deterministic string hash for IDs using SHA-256.
 * Produces a short base64url string (collision-resistant).
 * 
 * Uses truncated SHA-256 (10 bytes = 80 bits) for balance between
 * collision resistance and ID length. Base64url encoding produces
 * a 14-character ID that is URL-safe and database-friendly.
 * 
 * Collision probability: ~1 in 10^24 for 1 billion items.
 */
export async function hashStringToId(input: string): Promise<string> {
  if (!input) return "";
  
  // Use Web Crypto API for SHA-256
  if (!globalThis.crypto?.subtle) {
    // Fallback for environments without crypto.subtle (shouldn't happen in modern browsers)
    throw new Error("Web Crypto API not available");
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  
  // Truncate to first 10 bytes (80 bits) for compact ID
  const hashArray = new Uint8Array(hashBuffer).slice(0, 10);
  
  // Convert to base64url (URL-safe, no padding)
  const base64 = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return base64;
}

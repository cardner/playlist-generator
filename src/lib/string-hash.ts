/**
 * Simple deterministic string hash for IDs.
 * Produces a short base36 string for storage and comparisons.
 */
export function hashStringToId(input: string): string {
  if (!input) return "";
  let hashValue = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hashValue = ((hashValue << 5) - hashValue) + char;
    hashValue |= 0;
  }
  return Math.abs(hashValue).toString(36).padStart(8, "0");
}

// Client-side contact hashing for Private Contact Discovery
// Contacts are normalized then hashed to u128 (upper 128 bits of SHA-256)
// This happens entirely on the client - no plaintext contacts leave the device.

export const MAX_CONTACTS = 32;

/**
 * Normalize a contact identifier for consistent hashing:
 * - Trim whitespace
 * - Lowercase
 * - Phone: strip non-digits, add country code if missing
 * - Email: lowercase, trim
 */
export function normalizeContact(contact: string): string {
  let normalized = contact.trim().toLowerCase();

  // Phone number detection: contains mostly digits
  if (/^[\d\s\-\+\(\)]+$/.test(normalized)) {
    normalized = normalized.replace(/[^\d+]/g, "");
    if (!normalized.startsWith("+")) {
      normalized = "+1" + normalized; // Default country code
    }
  }

  return normalized;
}

/**
 * Hash a single contact to u128 (upper 128 bits of SHA-256).
 * Returns as BigInt for consistency with Arcium u128.
 */
export async function hashContact(contact: string): Promise<bigint> {
  const normalized = normalizeContact(contact);
  const encoded = new TextEncoder().encode(normalized);

  // SHA-256 via WebCrypto
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = new Uint8Array(hashBuffer);

  // Take upper 128 bits (first 16 bytes)
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result = (result << BigInt(8)) | BigInt(hashArray[i]);
  }

  return result;
}

/**
 * Hash a list of contacts, deduplicate, and pad to MAX_CONTACTS with zeros.
 * Returns fixed-size array of 32 u128 values.
 */
export async function hashContactList(
  contacts: string[]
): Promise<{
  hashes: bigint[];
  count: number;
}> {
  if (contacts.length > MAX_CONTACTS) {
    throw new Error(`Maximum ${MAX_CONTACTS} contacts allowed`);
  }

  // Deduplicate after normalization
  const unique = [...new Set(contacts.map(normalizeContact))].filter(
    (c) => c.length > 0
  );

  const hashes: bigint[] = new Array(MAX_CONTACTS).fill(BigInt(0));

  for (let i = 0; i < unique.length; i++) {
    hashes[i] = await hashContact(unique[i]);
  }

  return { hashes, count: unique.length };
}

/**
 * Convert u128 BigInt to a 16-byte Uint8Array (big-endian).
 */
export function u128ToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(16);
  let v = value;
  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }
  return bytes;
}

/**
 * Convert 16-byte Uint8Array (big-endian) to u128 BigInt.
 */
export function bytesToU128(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result = (result << BigInt(8)) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Given the original contact list and a set of matched hashes,
 * return the human-readable contacts that matched.
 */
export async function resolveMatches(
  originalContacts: string[],
  matchedHashes: bigint[]
): Promise<string[]> {
  const matches: string[] = [];
  const nonZeroHashes = matchedHashes.filter((h) => h !== BigInt(0));

  for (const contact of originalContacts) {
    const hash = await hashContact(contact);
    if (nonZeroHashes.some((h) => h === hash)) {
      matches.push(contact);
    }
  }

  return matches;
}

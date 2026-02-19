import { Connection, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "7RFXacB7U6bs3MnJYmue1EgPgbiUC9JsjbzWVDDPM64t"
);
export const ARCIUM_PROGRAM_ID = new PublicKey(
  "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
);
export const ARCIUM_FEE_POOL = new PublicKey(
  "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
);
export const ARCIUM_CLOCK = new PublicKey(
  "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
);
export const DEVNET_RPC = "https://api.devnet.solana.com";

// ============================================================
// TYPES
// ============================================================

export interface SessionAccount {
  sessionId: Uint8Array;
  alice: PublicKey;
  bob: PublicKey;
  status: number;
  bump: number;
}

export interface DisplaySession {
  id: string;
  publicKey: string;
  alice: string;
  bob: string;
  status: "awaiting_alice" | "awaiting_bob" | "computing" | "matched";
  statusLabel: string;
  isAlice: boolean;
  isBob: boolean;
}

// ============================================================
// DISCRIMINATOR & PARSING
// ============================================================

// Anchor discriminator: first 8 bytes of sha256("account:DiscoverySession")
const SESSION_DISCRIMINATOR = Buffer.from([
  0x4a, 0xa7, 0xb6, 0x21, 0xd3, 0xfd, 0xcf, 0x60,
]);

const STATUS_MAP = [
  "awaiting_alice",
  "awaiting_bob",
  "computing",
  "matched",
] as const;

const STATUS_LABELS = [
  "Created",
  "Waiting for Partner",
  "Computing Matches",
  "Complete",
];

/**
 * Parse a DiscoverySession account from raw on-chain data.
 * Layout: discriminator(8) + session_id(32) + alice(32) + bob(32) + status(1) + bump(1) = 106 bytes
 */
export function parseSessionAccount(
  data: Buffer
): SessionAccount | null {
  try {
    if (data.length < 106) return null;

    const accountData = data.slice(8);
    const sessionId = new Uint8Array(accountData.slice(0, 32));
    const alice = new PublicKey(accountData.slice(32, 64));
    const bob = new PublicKey(accountData.slice(64, 96));
    const status = accountData[96];
    const bump = accountData[97];

    return { sessionId, alice, bob, status, bump };
  } catch {
    return null;
  }
}

/**
 * Derive the PDA for a session given its ID.
 * Seeds: ["session", session_id]
 */
export function deriveSessionPda(sessionId: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), Buffer.from(sessionId)],
    PROGRAM_ID
  );
  return pda;
}

/**
 * Generate a random 32-byte session ID.
 */
export function generateSessionId(): Uint8Array {
  const id = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(id);
  } else {
    for (let i = 0; i < 32; i++) id[i] = Math.floor(Math.random() * 256);
  }
  return id;
}

/**
 * Convert session ID bytes to a short hex string for display.
 */
export function sessionIdToHex(sessionId: Uint8Array): string {
  return Array.from(sessionId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Fetch all sessions from the program, filtered by discriminator.
 */
export async function fetchAllSessions(
  connection: Connection,
  walletPubkey?: PublicKey
): Promise<DisplaySession[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { dataSize: 106 },
      { memcmp: { offset: 0, bytes: Buffer.from(SESSION_DISCRIMINATOR).toString("base64"), encoding: "base64" } },
    ],
  });

  const sessions: DisplaySession[] = [];

  for (const { pubkey, account } of accounts) {
    const parsed = parseSessionAccount(account.data as Buffer);
    if (!parsed) continue;

    const walletKey = walletPubkey?.toBase58() || "";

    sessions.push({
      id: sessionIdToHex(parsed.sessionId),
      publicKey: pubkey.toBase58(),
      alice: parsed.alice.toBase58(),
      bob: parsed.bob.toBase58(),
      status: STATUS_MAP[parsed.status] || "awaiting_alice",
      statusLabel: STATUS_LABELS[parsed.status] || "Unknown",
      isAlice: parsed.alice.toBase58() === walletKey,
      isBob: parsed.bob.toBase58() === walletKey,
    });
  }

  // Sort: user's sessions first, then by status
  if (walletPubkey) {
    sessions.sort((a, b) => {
      const aIsUser = a.isAlice || a.isBob ? 0 : 1;
      const bIsUser = b.isAlice || b.isBob ? 0 : 1;
      return aIsUser - bIsUser;
    });
  }

  return sessions;
}

/**
 * Fetch a single session by its PDA public key.
 */
export async function fetchSession(
  connection: Connection,
  sessionPda: PublicKey
): Promise<SessionAccount | null> {
  const account = await connection.getAccountInfo(sessionPda, "confirmed");
  if (!account) return null;
  return parseSessionAccount(account.data as Buffer);
}

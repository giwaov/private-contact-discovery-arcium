import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  x25519,
  RescueCipher,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getClusterAccAddress,
  getFeePoolAccAddress,
  getClockAccAddress,
  getArciumProgramId,
  deserializeLE,
} from "@arcium-hq/client";
import { PROGRAM_ID } from "./program";

// Cluster offset from our deployment (MXE was initialized on cluster offset 456)
export const CLUSTER_OFFSET = 456;

/**
 * Generate an x25519 keypair for Arcium encryption.
 */
export function generateEncryptionKeypair() {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Generate a random 16-byte nonce for Rescue cipher CTR mode.
 */
export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  return nonce;
}

/**
 * Generate a random computation offset (8 bytes).
 */
export function generateComputationOffset(): anchor.BN {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return new anchor.BN(Array.from(bytes));
}

/**
 * Create RescueCipher from the MXE public key for a given connection.
 */
export async function createCipher(
  connection: Connection,
): Promise<{
  cipher: RescueCipher;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  const { privateKey, publicKey } = generateEncryptionKeypair();

  // Fetch MXE public key from chain
  const provider = { connection } as anchor.AnchorProvider;
  const mxePublicKey = await getMXEPublicKey(provider, PROGRAM_ID);

  if (!mxePublicKey) {
    throw new Error(
      "Could not fetch MXE public key. Ensure the program is deployed and MXE is initialized."
    );
  }

  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);

  return { cipher, publicKey, privateKey };
}

/**
 * Encrypt contact hashes for submission to Arcium MPC.
 * Returns 32 encrypted u128 values (each as a 32-byte array) plus encrypted count.
 */
export function encryptContactHashes(
  cipher: RescueCipher,
  hashes: bigint[],
  count: number,
  nonce: Uint8Array,
): {
  encryptedHashes: number[][];
  encryptedCount: number[];
} {
  // Encrypt each u128 hash individually
  const encryptedHashes: number[][] = [];
  for (let i = 0; i < 32; i++) {
    const encrypted = cipher.encrypt([hashes[i]], nonce);
    encryptedHashes.push(encrypted[0]); // Each is a 32-byte array
  }

  // Encrypt count as u32
  const encCountResult = cipher.encrypt([BigInt(count)], nonce);
  const encryptedCount = encCountResult[0];

  return { encryptedHashes, encryptedCount };
}

/**
 * Get all Arcium account addresses for a queue_computation instruction.
 */
export function getArciumAccounts(compDefName: string, computationOffset: anchor.BN) {
  const mxeAccount = getMXEAccAddress(PROGRAM_ID);
  const mempoolAccount = getMempoolAccAddress(CLUSTER_OFFSET);
  const executingPool = getExecutingPoolAccAddress(CLUSTER_OFFSET);
  const computationAccount = getComputationAccAddress(CLUSTER_OFFSET, computationOffset);

  const compDefOffsetBytes = getCompDefAccOffset(compDefName);
  const compDefOffsetNum = Buffer.from(compDefOffsetBytes).readUInt32LE();
  const compDefAccount = getCompDefAccAddress(PROGRAM_ID, compDefOffsetNum);

  const clusterAccount = getClusterAccAddress(CLUSTER_OFFSET);
  const poolAccount = getFeePoolAccAddress();
  const clockAccount = getClockAccAddress();
  const arciumProgram = getArciumProgramId();

  return {
    mxeAccount,
    mempoolAccount,
    executingPool,
    computationAccount,
    compDefAccount,
    clusterAccount,
    poolAccount,
    clockAccount,
    arciumProgram,
    systemProgram: SystemProgram.programId,
  };
}

/**
 * Derive session PDA for the program.
 */
export function deriveSessionPda(sessionId: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), Buffer.from(sessionId)],
    PROGRAM_ID
  );
}

/**
 * Derive the sign PDA for the program (used by Arcium macros).
 */
export function deriveSignPda(): [PublicKey, number] {
  // The sign PDA seed is derived from sha256("arcium-signer-seed")
  // This matches the SIGN_PDA_SEED constant in arcium-anchor
  return PublicKey.findProgramAddressSync(
    [Buffer.from("arcium-signer-seed")],
    PROGRAM_ID
  );
}

/**
 * Convert nonce Uint8Array to BN for Anchor instruction.
 */
export function nonceToAnchorBN(nonce: Uint8Array): anchor.BN {
  return new anchor.BN(deserializeLE(nonce).toString());
}

/**
 * Generate a random 32-byte session ID.
 */
export function generateSessionId(): Uint8Array {
  const id = new Uint8Array(32);
  crypto.getRandomValues(id);
  return id;
}

/**
 * Convert session ID to hex for display.
 */
export function sessionIdToHex(sessionId: Uint8Array): string {
  return Array.from(sessionId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

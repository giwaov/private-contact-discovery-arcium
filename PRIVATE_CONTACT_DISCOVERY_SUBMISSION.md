# Private Contact Discovery on Arcium -- RTG Submission

**Builder:** giwaov
**Program ID:** `PCD1111111111111111111111111111111111111111` *(update after deployment)*
**Network:** Solana Devnet
**Source Code:** [github.com/giwaov/private-contact-discovery-arcium](https://github.com/giwaov/private-contact-discovery-arcium)

---

## Executive Summary

Private Contact Discovery is a privacy-preserving mutual contact matching system built on Solana using Arcium's MPC network. Two users can discover which contacts they share **without revealing their full address books** to each other, the network, or anyone else. The system implements Private Set Intersection (PSI) -- a cryptographic protocol where encrypted contact lists are compared inside Arcium's Multi-party eXecution Environment. Only the intersection (mutual contacts) is revealed; non-matching contacts remain permanently hidden.

This project demonstrates a real-world problem -- privacy-violating contact discovery -- that is impossible to solve without confidential computing. Arcium makes it practical.

---

## Problem Statement

Finding friends on any app today requires a massive privacy trade-off:

1. **Address book upload** -- Signal, WhatsApp, Telegram, and every social network requires uploading your entire contact list to their servers
2. **Server sees everything** -- The company learns everyone you know, even contacts who aren't on the platform
3. **Non-matches are leaked** -- The server now has a list of people who *don't* use the service, linked to your identity
4. **No verification** -- Users have zero way to verify that the server isn't logging, selling, or misusing contact data
5. **Regulatory risk** -- GDPR, CCPA, and other privacy regulations create liability for centralized contact storage

The scale is staggering: billions of phone numbers are uploaded to centralized servers daily. Each upload reveals the uploader's full social graph to a single corporate entity.

**Core problem:** Contact discovery requires comparing two private sets, but centralized servers force both sets into plaintext.

---

## Solution: PSI via Arcium MPC

Arcium's MPC network enables Private Set Intersection without trusted servers:

| Centralized Discovery | Private Contact Discovery (Arcium) |
|---|---|
| Full address book sent to server in plaintext | Contacts hashed client-side, encrypted, sent to MPC |
| Server sees all contacts | No single party sees any plaintext |
| Non-matching contacts exposed to server | Non-matches never revealed to anyone |
| Trust the company won't misuse data | Trustless -- MPC threshold security |
| No cryptographic verification | Every result verified on-chain via `output.verify_output()` |

The key insight: **Arcium lets us compare encrypted lists without decrypting them.** Two encrypted arrays go in; only matching entries come out.

---

## Technical Implementation

### Layer 1: ARCIS Circuits (MPC Logic)

Written in ARCIS (Arcium's Rust-based encrypted instruction language), running inside the MXE.

**Data structures:**

```rust
pub struct ContactList {
    pub hashes: [u128; 32],  // SHA-256 truncated to u128, zero-padded
    pub count: u32,           // Actual number of contacts
}

pub struct SessionState {
    pub alice_hashes: [u128; 32],
    pub alice_count: u32,
    pub bob_hashes: [u128; 32],
    pub bob_count: u32,
    pub alice_submitted: u8,
    pub bob_submitted: u8,
    pub is_matched: u8,
    pub result_alice: [u128; 32],  // Stored intersection results
    pub result_bob: [u128; 32],
    pub result_count: u32,
}

pub struct MatchResult {
    pub matches: [u128; 32],
    pub match_count: u32,
}
```

**Four circuits:**

#### `init_session`
Creates empty MXE-encrypted state:
```rust
#[instruction]
pub fn init_session(_input: Enc<Shared, u8>) -> Enc<Mxe, SessionState> {
    Enc::<Mxe, SessionState>::from_arcis(SessionState { /* zeros */ })
}
```

#### `submit_contacts_alice`
Stores Alice's encrypted contact hashes in the MXE-held state:
```rust
#[instruction]
pub fn submit_contacts_alice(
    current_state: Enc<Mxe, SessionState>,
    contacts: Enc<Shared, ContactList>,
) -> (Enc<Mxe, SessionState>, Enc<Shared, SubmitConfirmation>) {
    // Copies hashes into state (both branches always evaluated in MPC)
    // Returns confirmation to Alice
}
```

#### `submit_and_match` (Core PSI Circuit)
The main computation -- stores Bob's contacts and runs the 32x32 intersection:
```rust
#[instruction]
pub fn submit_and_match(
    current_state: Enc<Mxe, SessionState>,
    bob_contacts: Enc<Shared, ContactList>,
) -> (Enc<Mxe, SessionState>, Enc<Shared, MatchResult>) {
    let state = current_state.to_arcis();
    let bob = bob_contacts.to_arcis();

    let mut alice_matches = [0u128; 32];
    let mut bob_matches = [0u128; 32];
    let mut match_count: u32 = 0;

    // O(32*32) = 1024 encrypted comparisons
    for i in 0..32 {
        for j in 0..32 {
            let is_match = state.alice_hashes[i] != 0
                && bob.hashes[j] != 0
                && state.alice_hashes[i] == bob.hashes[j];

            alice_matches[i] = if is_match { state.alice_hashes[i] } else { alice_matches[i] };
            bob_matches[j] = if is_match { bob.hashes[j] } else { bob_matches[j] };
            match_count = if is_match { match_count + 1 } else { match_count };
        }
    }

    // Store results in state and return Bob's matches
    // ...
}
```

Both if/else branches are always evaluated in MPC -- preventing execution-pattern leakage.

#### `reveal_alice_matches`
Returns stored intersection results encrypted to Alice's key:
```rust
#[instruction]
pub fn reveal_alice_matches(
    current_state: Enc<Mxe, SessionState>,
    alice_key: Enc<Shared, u8>,
) -> Enc<Shared, MatchResult> {
    let state = current_state.to_arcis();
    alice_key.owner.from_arcis(MatchResult {
        matches: if state.is_matched == 1 { state.result_alice } else { [0u128; 32] },
        match_count: if state.is_matched == 1 { state.result_count } else { 0 },
    })
}
```

---

### Layer 2: Solana Program (On-Chain Orchestration)

Anchor program managing discovery sessions and bridging to Arcium's MPC network.

**Account structure:**
```
DiscoverySession PDA (106 bytes) -- seeds: ["session", session_id]
 - session_id:  [u8; 32]   -- Unique session identifier
 - alice:       Pubkey      -- First party (creates session)
 - bob:         Pubkey      -- Second party (joins session)
 - status:      u8          -- AwaitingAlice/AwaitingBob/Computing/Matched
 - bump:        u8          -- PDA bump seed
```

**Arcium integration points:**
1. `queue_computation()` -- Dispatches encrypted contact data to MPC nodes
2. `#[arcium_callback]` -- Receives and verifies MPC results on-chain
3. `ArgBuilder` -- Constructs encrypted arguments with X25519 keys and nonces
4. `SignedComputationOutputs<T>` -- Typed verification of MPC outputs
5. `comp_def_offset()` -- Registers 4 computation definitions

**Security checks:**
- Session status validation before each operation
- Authority checks (Alice can only submit to her slot, etc.)
- MPC output verification in every callback via `output.verify_output()`

---

### Layer 3: Client-Side Processing

**Contact hashing pipeline (all client-side, nothing leaves the browser in plaintext):**

1. **Normalize** contacts -- lowercase, strip phone formatting, add country codes
2. **Deduplicate** -- prevent double entries
3. **SHA-256 hash** via WebCrypto API -- browser-native, no external dependencies
4. **Truncate to u128** -- upper 128 bits of hash (collision probability: ~2^-128)
5. **Zero-pad to [u128; 32]** -- fixed-size array required by ARCIS

### Layer 4: Frontend

**Stack:** Next.js 14, TypeScript, Solana Wallet Adapter, Tailwind CSS

**Three tabs:**
- **Discover** -- Create or join a session, enter contacts, see results
- **My Sessions** -- View past and active sessions with status indicators
- **How It Works** -- Interactive explanation of PSI and privacy guarantees

Arcium-themed glassmorphism UI with purple/cyan gradients.

---

## Arcium Features Used

| Feature | How It's Used |
|---------|--------------|
| **MXE** | Hosts encrypted SessionState with both parties' contact hashes |
| **ARCIS** | Encrypted instruction language for PSI comparison circuits |
| **`Enc<Mxe, T>`** | SessionState encrypted with cluster key -- no single party decrypts |
| **`Enc<Shared, T>`** | Contact lists and match results shared between user and MPC |
| **`queue_computation()`** | Dispatches encrypted contact data to MPC nodes |
| **`#[arcium_callback]`** | Receives and verifies MPC results on-chain |
| **`ArgBuilder`** | Constructs encrypted arguments (x25519 pubkeys, nonces, ciphertexts) |
| **`comp_def_offset()`** | Registers computation definitions for 4 circuits |
| **`SignedComputationOutputs`** | Typed verification of MPC outputs against cluster |
| **`ArciumSignerAccount`** | Sign PDA for Arcium callback verification |

---

## Deployment Artifacts

| Artifact | Status | Reference |
|----------|--------|-----------|
| Solana Program | To be deployed | `PCD111...` (placeholder) |
| ARCIS Circuits | Built | `init_session`, `submit_contacts_alice`, `submit_and_match`, `reveal_alice_matches` |
| Frontend | Built | Next.js 14 + Tailwind |
| Source Code | Public | github.com/giwaov/private-contact-discovery-arcium |

---

## Real-World Impact

Contact discovery is one of the most common privacy compromises people make daily. Every time someone signs up for a social app, they upload their entire address book -- exposing not just their own relationships, but the phone numbers and emails of everyone they know.

Private Contact Discovery demonstrates that **this trade-off is unnecessary.** Arcium's MPC makes it possible to find mutual contacts with the same convenience but without the privacy cost.

This pattern generalizes to any "find who we have in common" scenario: business partner matching, healthcare provider discovery, dating app interest matching, and whistleblower network verification.

---

## Summary

Private Contact Discovery on Arcium demonstrates that **privacy-preserving contact matching is practical on Solana today.** The project covers the full stack: ARCIS circuits for PSI computation, Anchor program with `queue_computation` and callbacks, client-side contact hashing, and a polished frontend.

The core innovation: **discovering shared contacts without exposing non-shared contacts.** Arcium's MPC makes this possible -- two encrypted lists enter the computation, and only their intersection comes out. No trusted servers, no plaintext uploads, no privacy compromises.

---

**Built for the Arcium RTG Program by giwaov.**

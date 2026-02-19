# Private Contact Discovery on Arcium

Find mutual contacts without revealing your address book. Powered by Arcium's MPC network for Private Set Intersection (PSI) on Solana.

**Program ID:** [`7RFXacB7U6bs3MnJYmue1EgPgbiUC9JsjbzWVDDPM64t`](https://explorer.solana.com/address/7RFXacB7U6bs3MnJYmue1EgPgbiUC9JsjbzWVDDPM64t?cluster=devnet)
**Network:** Solana Devnet
**Live Demo:** [private-contact-discovery-frontend.vercel.app](https://private-contact-discovery-frontend.vercel.app)
**Author:** [giwaov](https://github.com/giwaov) | [@giwaov](https://x.com/giwaov)

---

## Overview

Private Contact Discovery lets two users discover which contacts they have in common **without revealing their full contact lists** to each other, the network, or anyone else.

Traditional contact discovery (Signal, WhatsApp, social networks) requires uploading your entire address book to a central server. This creates massive privacy risks: the server sees all your contacts, even those who aren't on the platform.

Arcium's MPC network solves this with Private Set Intersection -- encrypted contact hashes are compared inside a Multi-party eXecution Environment where no single node ever sees plaintext data.

---

## How It Works

```
Alice                          Arcium MPC Nodes                    Bob
  |                                   |                              |
  | 1. Hash contacts (client-side)    |                              |
  | 2. Encrypt with X25519            |                              |
  | 3. Submit to Solana program  ---->| queue_computation()          |
  |                                   | (stores in Enc<Mxe> state)   |
  |                                   |                              |
  |                                   |    4. Hash contacts           |
  |                                   |    5. Encrypt with X25519     |
  |    queue_computation() <----------| 6. Submit & trigger PSI  <---|
  |                                   |                              |
  |                                   | 7. 32x32 comparison loop     |
  |                                   |    on ENCRYPTED data          |
  |                                   |    (1024 comparisons)         |
  |                                   |                              |
  | 8. Receive encrypted matches <----| callback with results   ---->| 9. Receive encrypted matches
  | 10. Decrypt locally               |                              | 11. Decrypt locally
  |                                   |                              |
  | "You have 3 mutual contacts!"     |     "You have 3 mutual contacts!"
```

### What stays private:
- Full contact lists are **never uploaded** in plaintext
- Contacts that don't match are **never revealed** to anyone
- MPC nodes collectively compute comparisons -- **no single node sees any data**
- Only the intersection is returned, encrypted to each party's key

---

## Architecture

### ARCIS Circuits (MPC Logic)

Four encrypted instructions running inside Arcium's MXE:

| Circuit | Purpose | Input | Output |
|---------|---------|-------|--------|
| `init_session` | Create empty encrypted state | Dummy `u8` | `Enc<Mxe, SessionState>` |
| `submit_contacts_alice` | Store Alice's hashed contacts | `Enc<Shared, ContactList>` | Confirmation + updated state |
| `submit_and_match` | Store Bob's contacts + run PSI | `Enc<Shared, ContactList>` | `Enc<Shared, MatchResult>` for Bob |
| `reveal_alice_matches` | Return Alice's match results | Alice's key | `Enc<Shared, MatchResult>` for Alice |

**Core PSI loop** (inside `submit_and_match`):
```rust
for i in 0..32 {
    for j in 0..32 {
        let is_match = alice_hash[i] != 0
            && bob_hash[j] != 0
            && alice_hash[i] == bob_hash[j]
            && can_proceed;

        alice_matches[i] = if is_match { alice_hash[i] } else { alice_matches[i] };
        bob_matches[j] = if is_match { bob_hash[j] } else { bob_matches[j] };
    }
}
```

Both branches are always evaluated in MPC -- the condition only selects which result to use. This prevents information leakage through execution patterns.

### Solana Program (On-Chain Orchestration)

```
DiscoverySession PDA (106 bytes) -- seeds: ["session", session_id]
 - session_id:  [u8; 32]   -- Unique session identifier
 - alice:       Pubkey      -- First party
 - bob:         Pubkey      -- Second party
 - status:      u8          -- AwaitingAlice/AwaitingBob/Computing/Matched
 - bump:        u8          -- PDA bump seed
```

**8 instructions:** 4 comp def initializations + `create_session`, `submit_contacts_alice`, `submit_and_match`, `reveal_alice_matches`, plus 4 `#[arcium_callback]` handlers.

### Client-Side Processing

Contacts are processed entirely on the client before encryption:
1. **Normalize** -- lowercase, strip phone formatting, add country codes
2. **Deduplicate** -- prevent repeat entries
3. **SHA-256 hash** -- via WebCrypto API
4. **Truncate to u128** -- upper 128 bits of SHA-256, negligible collision probability
5. **Pad to 32 entries** -- fixed-size array required by ARCIS

Encryption uses `@arcium-hq/client` SDK: X25519 key exchange with MXE public key, Rescue cipher (CTR mode) for each u128 hash.

---

## Project Structure

```
private-contact-discovery-arcium/
  encrypted-ixs/src/lib.rs           # ARCIS MPC circuits (PSI logic)
  programs/private-contact-discovery/
    src/lib.rs                        # Anchor Solana program
  tests/                              # Integration tests
  frontend/
    src/
      app/
        page.tsx                      # Main UI (Discover, Sessions, How It Works)
        layout.tsx                    # Next.js layout with custom fonts
        globals.css                   # Arcium-themed styling
      components/
        WalletContextProvider.tsx      # Solana wallet adapter
        AppWrapper.tsx                # SSR wrapper
      utils/
        hash.ts                       # Client-side contact hashing (SHA-256)
        program.ts                    # On-chain account parsing & session queries
        arcium.ts                     # Arcium SDK integration (encryption, PDAs)
```

---

## Building

### Prerequisites

- Rust (latest stable)
- Solana CLI v2.3.0+
- Anchor 0.32.1+
- Arcium CLI (`curl -sSf https://install.arcium.com | sh`)
- Node.js 20+

### Build & Deploy

```bash
# Build ARCIS circuits and Solana program
cd private-contact-discovery
arcium build

# Run tests
arcium test

# Deploy to devnet
arcium deploy

# Frontend
cd frontend
npm install
npm run dev
```

---

## Deployment

| Artifact | Status | Reference |
|----------|--------|-----------|
| Solana Program | Deployed | [`7RFXac...M64t`](https://explorer.solana.com/address/7RFXacB7U6bs3MnJYmue1EgPgbiUC9JsjbzWVDDPM64t?cluster=devnet) |
| MXE State | Initialized | Cluster offset 456 |
| ARCIS Circuits | Deployed | 4 computation definitions registered |
| Frontend | Live | [private-contact-discovery-frontend.vercel.app](https://private-contact-discovery-frontend.vercel.app) |

---

## Privacy vs. Traditional Contact Discovery

| | Traditional (Signal, etc.) | Private Contact Discovery (Arcium) |
|---|---|---|
| **Upload contacts** | Full address book sent to server | Hashed + encrypted client-side, sent to MPC |
| **Server sees** | All your contacts in plaintext | Only encrypted ciphertexts |
| **Non-matching contacts** | Server knows who isn't on platform | Never revealed to anyone |
| **Trust model** | Trust the server operator | Trustless -- MPC threshold protects data |
| **Verification** | No way to verify server behavior | Cryptographic proofs verified on Solana |

---

## Use Cases

1. **Social Networks** -- "Find Friends" without exposing your entire phone book
2. **Dating Apps** -- Mutual interest matching without revealing non-matches
3. **Professional Networking** -- Discover shared connections privately
4. **Healthcare** -- Find shared providers without revealing medical contacts
5. **Supply Chain** -- Discover mutual business partners confidentially
6. **Whistleblower Networks** -- Check for trusted contacts without exposure

---

## License

MIT

---

**Built for the Arcium RTG Program by [giwaov](https://github.com/giwaov).**

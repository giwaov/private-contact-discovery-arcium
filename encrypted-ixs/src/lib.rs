// Private Contact Discovery - Encrypted Instructions
// Arcium RTG Submission
// Author: giwaov
//
// MPC circuits for Private Set Intersection (PSI).
// Two users submit encrypted contact hashes; the circuit
// computes the intersection without revealing either full list.
// Non-matching contacts remain completely hidden.

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Maximum contacts per user. Fixed at compile time (ARCIS requirement).
    /// 32 contacts = 1024 comparisons in PSI, well within MPC budget.
    const MAX_CONTACTS: usize = 32;

    // ================================================================
    // STRUCTS
    // ================================================================

    /// A user's contact list: fixed-size array of hashed contact identifiers.
    /// Each contact is the upper 128 bits of SHA-256(normalize(contact)).
    /// Unused slots MUST be 0 (padding).
    pub struct ContactList {
        /// Hashed contact identifiers (u128 each, zero-padded)
        pub hashes: [u128; 32],
        /// How many slots are actually used (1..=32), rest are 0
        pub count: u32,
    }

    /// Session state held encrypted by the MXE cluster.
    /// Stores both parties' lists and the intersection results.
    pub struct SessionState {
        /// Alice's contact hashes (first submitter)
        pub alice_hashes: [u128; 32],
        /// Number of Alice's contacts
        pub alice_count: u32,
        /// Bob's contact hashes (second submitter)
        pub bob_hashes: [u128; 32],
        /// Number of Bob's contacts
        pub bob_count: u32,
        /// Whether Alice has submitted (1=yes, 0=no)
        pub alice_submitted: u8,
        /// Whether Bob has submitted and matching is done (1=yes, 0=no)
        pub bob_submitted: u8,
        /// Whether matching has been performed (1=yes, 0=no)
        pub is_matched: u8,
        /// Stored intersection from Alice's perspective (0 = no match)
        pub result_alice: [u128; 32],
        /// Stored intersection from Bob's perspective (0 = no match)
        pub result_bob: [u128; 32],
        /// Number of matches found
        pub result_count: u32,
    }

    /// The intersection result returned to a user.
    pub struct MatchResult {
        /// Matched contact hashes (0 = no match at that slot)
        pub matches: [u128; 32],
        /// Total number of mutual contacts found
        pub match_count: u32,
    }

    /// Lightweight confirmation returned after contact submission
    pub struct SubmitConfirmation {
        /// 1 if accepted, 0 if rejected
        pub accepted: u8,
        /// Which party number (1=Alice, 2=Bob)
        pub party: u8,
    }

    // ================================================================
    // INSTRUCTIONS
    // ================================================================

    /// Initialize a new PSI session.
    /// Creates empty encrypted state for the MXE to hold.
    #[instruction]
    pub fn init_session(
        _input: Enc<Shared, u8>,
    ) -> Enc<Mxe, SessionState> {
        let initial = SessionState {
            alice_hashes: [0u128; 32],
            alice_count: 0,
            bob_hashes: [0u128; 32],
            bob_count: 0,
            alice_submitted: 0,
            bob_submitted: 0,
            is_matched: 0,
            result_alice: [0u128; 32],
            result_bob: [0u128; 32],
            result_count: 0,
        };

        Enc::<Mxe, SessionState>::from_arcis(initial)
    }

    /// Submit contacts as the first party (Alice).
    /// Stores the encrypted contact list in session state.
    /// Returns a confirmation to the submitter.
    #[instruction]
    pub fn submit_contacts_alice(
        current_state: Enc<Mxe, SessionState>,
        contacts: Enc<Shared, ContactList>,
    ) -> (Enc<Mxe, SessionState>, Enc<Shared, SubmitConfirmation>) {
        let state = current_state.to_arcis();
        let list = contacts.to_arcis();

        // Check if Alice slot is available
        let slot_available = state.alice_submitted == 0;

        // Copy hashes into state (both branches always evaluated in MPC)
        let mut new_hashes = [0u128; 32];
        for i in 0..32 {
            new_hashes[i] = if slot_available {
                list.hashes[i]
            } else {
                state.alice_hashes[i]
            };
        }

        let new_count = if slot_available {
            list.count
        } else {
            state.alice_count
        };

        let new_submitted = if slot_available {
            1u8
        } else {
            state.alice_submitted
        };

        let updated = SessionState {
            alice_hashes: new_hashes,
            alice_count: new_count,
            bob_hashes: state.bob_hashes,
            bob_count: state.bob_count,
            alice_submitted: new_submitted,
            bob_submitted: state.bob_submitted,
            is_matched: state.is_matched,
            result_alice: state.result_alice,
            result_bob: state.result_bob,
            result_count: state.result_count,
        };

        let confirmation = SubmitConfirmation {
            accepted: if slot_available { 1 } else { 0 },
            party: 1,
        };

        (
            Enc::<Mxe, SessionState>::from_arcis(updated),
            contacts.owner.from_arcis(confirmation),
        )
    }

    /// Submit contacts as the second party (Bob) AND compute intersection.
    /// This is the core PSI circuit: O(32*32) = 1024 comparisons.
    /// Returns Bob's match result; Alice's is stored in state for later retrieval.
    #[instruction]
    pub fn submit_and_match(
        current_state: Enc<Mxe, SessionState>,
        bob_contacts: Enc<Shared, ContactList>,
    ) -> (Enc<Mxe, SessionState>, Enc<Shared, MatchResult>) {
        let state = current_state.to_arcis();
        let bob = bob_contacts.to_arcis();

        // Both parties must have valid state
        let alice_ready = state.alice_submitted == 1;
        let not_already_matched = state.is_matched == 0;
        let can_proceed = alice_ready && not_already_matched;

        // ============================================
        // CORE PSI: Nested loop with fixed bounds
        // Compare every Alice hash against every Bob hash.
        // Both branches are always evaluated in MPC to
        // prevent information leakage via execution patterns.
        // ============================================

        let mut alice_matches = [0u128; 32];
        let mut bob_matches = [0u128; 32];
        let mut match_count: u32 = 0;

        for i in 0..32 {
            let alice_hash = state.alice_hashes[i];
            let alice_valid = alice_hash != 0;

            for j in 0..32 {
                let bob_hash = bob.hashes[j];
                let bob_valid = bob_hash != 0;

                // A match: both valid, non-zero, equal, and session can proceed
                let is_match = alice_valid && bob_valid && (alice_hash == bob_hash) && can_proceed;

                // Mark matched positions (both branches always evaluated)
                alice_matches[i] = if is_match { alice_hash } else { alice_matches[i] };
                bob_matches[j] = if is_match { bob_hash } else { bob_matches[j] };

                // Increment match count
                // Client-side deduplication prevents double-counting
                match_count = if is_match {
                    match_count + 1
                } else {
                    match_count
                };
            }
        }

        // Store Bob's hashes and results in state
        let updated = SessionState {
            alice_hashes: state.alice_hashes,
            alice_count: state.alice_count,
            bob_hashes: if can_proceed { bob.hashes } else { state.bob_hashes },
            bob_count: if can_proceed { bob.count } else { state.bob_count },
            alice_submitted: state.alice_submitted,
            bob_submitted: if can_proceed { 1 } else { state.bob_submitted },
            is_matched: if can_proceed { 1 } else { state.is_matched },
            result_alice: if can_proceed { alice_matches } else { state.result_alice },
            result_bob: if can_proceed { bob_matches } else { state.result_bob },
            result_count: if can_proceed { match_count } else { state.result_count },
        };

        // Return Bob's matches encrypted to his key
        let result = MatchResult {
            matches: bob_matches,
            match_count,
        };

        (
            Enc::<Mxe, SessionState>::from_arcis(updated),
            bob_contacts.owner.from_arcis(result),
        )
    }

    /// Reveal Alice's matches.
    /// Called after submit_and_match so Alice can retrieve her intersection.
    /// Reads stored results from MXE-encrypted state and encrypts to Alice's key.
    #[instruction]
    pub fn reveal_alice_matches(
        current_state: Enc<Mxe, SessionState>,
        alice_key: Enc<Shared, u8>,
    ) -> Enc<Shared, MatchResult> {
        let state = current_state.to_arcis();

        // Only return results if matching is complete
        let matched = state.is_matched == 1;

        let result_matches = if matched {
            state.result_alice
        } else {
            [0u128; 32]
        };

        let result_count = if matched {
            state.result_count
        } else {
            0
        };

        let result = MatchResult {
            matches: result_matches,
            match_count: result_count,
        };

        alice_key.owner.from_arcis(result)
    }
}

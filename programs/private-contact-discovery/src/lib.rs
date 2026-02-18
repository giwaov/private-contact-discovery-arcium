// Private Contact Discovery - Solana Program
// Arcium RTG Submission
// Author: giwaov
//
// This program orchestrates private contact discovery on Solana,
// delegating encrypted PSI computations to Arcium's MPC network.
// Users submit encrypted contact hashes; the MPC nodes compute
// the intersection without anyone seeing the full lists.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// Computation definition offsets for each encrypted instruction
const COMP_DEF_OFFSET_INIT_SESSION: u32 = comp_def_offset("init_session");
const COMP_DEF_OFFSET_SUBMIT_ALICE: u32 = comp_def_offset("submit_contacts_alice");
const COMP_DEF_OFFSET_SUBMIT_AND_MATCH: u32 = comp_def_offset("submit_and_match");
const COMP_DEF_OFFSET_REVEAL_ALICE: u32 = comp_def_offset("reveal_alice_matches");

declare_id!("PCD1111111111111111111111111111111111111111");

#[arcium_program]
pub mod private_contact_discovery {
    use super::*;

    // ============================================================
    // COMPUTATION DEFINITION INITIALIZATION
    // ============================================================

    /// Initialize the computation definition for init_session
    pub fn init_session_comp_def(ctx: Context<InitSessionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize the computation definition for submit_contacts_alice
    pub fn init_submit_alice_comp_def(ctx: Context<InitSubmitAliceCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize the computation definition for submit_and_match
    pub fn init_submit_and_match_comp_def(ctx: Context<InitSubmitAndMatchCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Initialize the computation definition for reveal_alice_matches
    pub fn init_reveal_alice_comp_def(ctx: Context<InitRevealAliceCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // ============================================================
    // SESSION MANAGEMENT
    // ============================================================

    /// Create a new PSI session between two parties.
    /// Alice creates the session and initializes encrypted state.
    pub fn create_session(
        ctx: Context<CreateSession>,
        computation_offset: u64,
        session_id: [u8; 32],
        pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        session.session_id = session_id;
        session.alice = ctx.accounts.payer.key();
        session.bob = Pubkey::default();
        session.status = SessionStatus::AwaitingAlice as u8;
        session.bump = ctx.bumps.session;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Build args for encrypted init (dummy input to establish encryption)
        let args = ArgBuilder::new()
            .x25519_pubkey(pubkey)
            .plaintext_u128(nonce)
            .encrypted_u8([0u8; 32])
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![InitSessionCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        emit!(SessionCreated {
            session_id,
            alice: ctx.accounts.payer.key(),
        });

        Ok(())
    }

    /// Callback for session initialization
    #[arcium_callback(encrypted_ix = "init_session")]
    pub fn init_session_callback(
        ctx: Context<InitSessionCallback>,
        output: SignedComputationOutputs<InitSessionOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(out) => out,
            Err(_) => return Err(ErrorCode::ComputationFailed.into()),
        };

        emit!(SessionInitialized {});

        Ok(())
    }

    // ============================================================
    // ALICE SUBMITS CONTACTS
    // ============================================================

    /// Alice submits her encrypted contact hashes.
    /// Contacts are hashed client-side (SHA-256 -> u128) before encryption.
    pub fn submit_contacts_alice(
        ctx: Context<SubmitContactsAlice>,
        computation_offset: u64,
        encrypted_hashes: [[u8; 32]; 32],
        encrypted_count: [u8; 32],
        pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;

        require!(
            session.status == SessionStatus::AwaitingAlice as u8,
            ErrorCode::InvalidSessionState
        );
        require!(
            ctx.accounts.alice.key() == session.alice,
            ErrorCode::Unauthorized
        );

        session.status = SessionStatus::AwaitingBob as u8;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Build args: ContactList struct = 32 x u128 hashes + u32 count
        let mut builder = ArgBuilder::new()
            .x25519_pubkey(pubkey)
            .plaintext_u128(nonce);

        // Each hash is an encrypted u128 (in 32-byte ciphertext)
        for i in 0..32 {
            builder = builder.encrypted_u128(encrypted_hashes[i]);
        }
        // Contact count
        builder = builder.encrypted_u32(encrypted_count);

        let args = builder.build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![SubmitAliceCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        emit!(ContactsSubmitted {
            session_id: session.session_id,
            party: 1,
        });

        Ok(())
    }

    /// Callback for Alice's contact submission
    #[arcium_callback(encrypted_ix = "submit_contacts_alice")]
    pub fn submit_alice_callback(
        ctx: Context<SubmitAliceCallback>,
        output: SignedComputationOutputs<SubmitContactsAliceOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(out) => out,
            Err(_) => return Err(ErrorCode::ComputationFailed.into()),
        };

        emit!(AliceSubmitted {});

        Ok(())
    }

    // ============================================================
    // BOB SUBMITS AND TRIGGERS MATCH
    // ============================================================

    /// Bob submits contacts AND the MPC computes the intersection.
    /// This is the core PSI operation: 32x32 = 1024 encrypted comparisons.
    /// Bob receives his matches immediately via the callback.
    pub fn submit_and_match(
        ctx: Context<SubmitAndMatch>,
        computation_offset: u64,
        encrypted_hashes: [[u8; 32]; 32],
        encrypted_count: [u8; 32],
        pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;

        require!(
            session.status == SessionStatus::AwaitingBob as u8,
            ErrorCode::InvalidSessionState
        );

        // Record Bob's identity
        session.bob = ctx.accounts.bob.key();
        session.status = SessionStatus::Computing as u8;

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Build args: ContactList struct = 32 x u128 hashes + u32 count
        let mut builder = ArgBuilder::new()
            .x25519_pubkey(pubkey)
            .plaintext_u128(nonce);

        for i in 0..32 {
            builder = builder.encrypted_u128(encrypted_hashes[i]);
        }
        builder = builder.encrypted_u32(encrypted_count);

        let args = builder.build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![SubmitAndMatchCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        emit!(MatchComputing {
            session_id: session.session_id,
        });

        Ok(())
    }

    /// Callback for PSI computation
    #[arcium_callback(encrypted_ix = "submit_and_match")]
    pub fn submit_and_match_callback(
        ctx: Context<SubmitAndMatchCallback>,
        output: SignedComputationOutputs<SubmitAndMatchOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(out) => out,
            Err(_) => return Err(ErrorCode::ComputationFailed.into()),
        };

        emit!(MatchComplete {});

        Ok(())
    }

    // ============================================================
    // ALICE REVEALS HER MATCHES
    // ============================================================

    /// Alice retrieves her side of the intersection result.
    /// The MPC reads stored results from encrypted state and
    /// encrypts them to Alice's key.
    pub fn reveal_alice_matches(
        ctx: Context<RevealAliceMatches>,
        computation_offset: u64,
        pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        let session = &ctx.accounts.session;

        require!(
            session.status == SessionStatus::Matched as u8,
            ErrorCode::InvalidSessionState
        );
        require!(
            ctx.accounts.alice.key() == session.alice,
            ErrorCode::Unauthorized
        );

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Dummy encrypted input to establish Alice's encryption key
        let args = ArgBuilder::new()
            .x25519_pubkey(pubkey)
            .plaintext_u128(nonce)
            .encrypted_u8([0u8; 32])
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![RevealAliceCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        emit!(AliceRevealing {
            session_id: session.session_id,
        });

        Ok(())
    }

    /// Callback for Alice's match reveal
    #[arcium_callback(encrypted_ix = "reveal_alice_matches")]
    pub fn reveal_alice_callback(
        ctx: Context<RevealAliceCallback>,
        output: SignedComputationOutputs<RevealAliceMatchesOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(out) => out,
            Err(_) => return Err(ErrorCode::ComputationFailed.into()),
        };

        emit!(AliceRevealed {});

        Ok(())
    }
}

// ============================================================
// ACCOUNT STRUCTURES
// ============================================================

#[repr(u8)]
pub enum SessionStatus {
    AwaitingAlice = 0,
    AwaitingBob = 1,
    Computing = 2,
    Matched = 3,
}

#[account]
#[derive(Default)]
pub struct DiscoverySession {
    /// Unique session identifier
    pub session_id: [u8; 32],
    /// First party (creates the session)
    pub alice: Pubkey,
    /// Second party (joins the session)
    pub bob: Pubkey,
    /// Current session status
    pub status: u8,
    /// PDA bump seed
    pub bump: u8,
}

impl DiscoverySession {
    // 8 (discriminator) + 32 + 32 + 32 + 1 + 1 = 106 bytes
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 1 + 1;
}

// ============================================================
// CONTEXT STRUCTURES - Queue Computation
// ============================================================

#[queue_computation_accounts("init_session", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, session_id: [u8; 32])]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = DiscoverySession::SIZE,
        seeds = [b"session", session_id.as_ref()],
        bump
    )]
    pub session: Account<'info, DiscoverySession>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_SESSION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("submit_contacts_alice", alice)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SubmitContactsAlice<'info> {
    #[account(mut)]
    pub alice: Signer<'info>,
    #[account(mut)]
    pub session: Account<'info, DiscoverySession>,
    #[account(
        init_if_needed,
        space = 9,
        payer = alice,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SUBMIT_ALICE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("submit_and_match", bob)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SubmitAndMatch<'info> {
    #[account(mut)]
    pub bob: Signer<'info>,
    #[account(mut)]
    pub session: Account<'info, DiscoverySession>,
    #[account(
        init_if_needed,
        space = 9,
        payer = bob,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SUBMIT_AND_MATCH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("reveal_alice_matches", alice)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RevealAliceMatches<'info> {
    #[account(mut)]
    pub alice: Signer<'info>,
    #[account(mut)]
    pub session: Account<'info, DiscoverySession>,
    #[account(
        init_if_needed,
        space = 9,
        payer = alice,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_ALICE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

// ============================================================
// CONTEXT STRUCTURES - Callbacks
// ============================================================

#[callback_accounts("init_session")]
#[derive(Accounts)]
pub struct InitSessionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_SESSION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("submit_contacts_alice")]
#[derive(Accounts)]
pub struct SubmitAliceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SUBMIT_ALICE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("submit_and_match")]
#[derive(Accounts)]
pub struct SubmitAndMatchCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SUBMIT_AND_MATCH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

#[callback_accounts("reveal_alice_matches")]
#[derive(Accounts)]
pub struct RevealAliceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_REVEAL_ALICE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

// ============================================================
// COMPUTATION DEFINITION INIT CONTEXTS
// ============================================================

#[init_computation_definition_accounts("init_session", payer)]
#[derive(Accounts)]
pub struct InitSessionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("submit_contacts_alice", payer)]
#[derive(Accounts)]
pub struct InitSubmitAliceCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("submit_and_match", payer)]
#[derive(Accounts)]
pub struct InitSubmitAndMatchCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("reveal_alice_matches", payer)]
#[derive(Accounts)]
pub struct InitRevealAliceCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct SessionCreated {
    pub session_id: [u8; 32],
    pub alice: Pubkey,
}

#[event]
pub struct SessionInitialized {}

#[event]
pub struct ContactsSubmitted {
    pub session_id: [u8; 32],
    pub party: u8,
}

#[event]
pub struct AliceSubmitted {}

#[event]
pub struct MatchComputing {
    pub session_id: [u8; 32],
}

#[event]
pub struct MatchComplete {}

#[event]
pub struct AliceRevealing {
    pub session_id: [u8; 32],
}

#[event]
pub struct AliceRevealed {}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Computation failed")]
    ComputationFailed,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Invalid session state for this operation")]
    InvalidSessionState,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Session already matched")]
    AlreadyMatched,
}

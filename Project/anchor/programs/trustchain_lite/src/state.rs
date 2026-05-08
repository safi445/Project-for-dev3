use anchor_lang::prelude::*;

#[account]
pub struct Escrow {
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub job_id: u64,
    pub amount_lamports: u64,
    pub status: EscrowStatus,
    pub bump: u8,
}

impl Escrow {
    // discriminator (8) + pubkey (32) * 2 + u64 (8) * 2 + status (1) + bump (1)
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[account]
pub struct Reputation {
    pub user: Pubkey,
    pub score: u64,
    pub completed_jobs: u64,
}

impl Reputation {
    // discriminator (8) + pubkey (32) + u64 (8) + u64 (8)
    pub const SPACE: usize = 8 + 32 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowStatus {
    Funded = 0,
    Released = 1,
}


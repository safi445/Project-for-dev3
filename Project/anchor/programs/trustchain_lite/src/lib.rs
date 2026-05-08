use anchor_lang::prelude::*;

mod state;
use state::*;

declare_id!("Tru5tCha1nL1te11111111111111111111111111111");

#[program]
pub mod trustchain_lite {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        job_id: u64,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, TrustChainError::InvalidAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.freelancer = ctx.accounts.freelancer.key();
        escrow.job_id = job_id;
        escrow.amount_lamports = amount_lamports;
        escrow.status = EscrowStatus::Funded;
        escrow.bump = ctx.bumps.escrow;

        // Move lamports from client -> escrow PDA.
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.client.key(),
            &escrow.key(),
            amount_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.client.to_account_info(),
                escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        emit!(EscrowCreated {
            escrow: escrow.key(),
            client: escrow.client,
            freelancer: escrow.freelancer,
            job_id,
            amount_lamports,
        });

        Ok(())
    }

    pub fn approve_and_release(ctx: Context<ApproveAndRelease>, _job_id: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(
            escrow.status == EscrowStatus::Funded,
            TrustChainError::InvalidStatus
        );
        require_keys_eq!(escrow.client, ctx.accounts.client.key(), TrustChainError::Unauthorized);
        require_keys_eq!(
            escrow.freelancer,
            ctx.accounts.freelancer.key(),
            TrustChainError::InvalidFreelancer
        );

        let amount = escrow.amount_lamports;
        require!(
            **escrow.to_account_info().lamports.borrow() >= amount,
            TrustChainError::InsufficientEscrowBalance
        );

        // Program owns the escrow account, so it can move lamports directly.
        **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .freelancer
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        escrow.status = EscrowStatus::Released;

        let client_rep = &mut ctx.accounts.client_reputation;
        let freelancer_rep = &mut ctx.accounts.freelancer_reputation;

        client_rep.user = escrow.client;
        freelancer_rep.user = escrow.freelancer;

        client_rep.completed_jobs = client_rep.completed_jobs.saturating_add(1);
        freelancer_rep.completed_jobs = freelancer_rep.completed_jobs.saturating_add(1);

        // Simple hackathon scoring rule: +1 point per completed job.
        client_rep.score = client_rep.score.saturating_add(1);
        freelancer_rep.score = freelancer_rep.score.saturating_add(1);

        emit!(EscrowReleased {
            escrow: escrow.key(),
            client: escrow.client,
            freelancer: escrow.freelancer,
            amount_lamports: amount,
            client_score: client_rep.score,
            freelancer_score: freelancer_rep.score,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,

    /// CHECK: Only used as a public key and lamports destination later.
    pub freelancer: UncheckedAccount<'info>,

    #[account(
        init,
        payer = client,
        space = Escrow::SPACE,
        seeds = [b"escrow", client.key().as_ref(), freelancer.key().as_ref(), &job_id.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct ApproveAndRelease<'info> {
    #[account(mut)]
    pub client: Signer<'info>,

    /// CHECK: destination for lamports
    #[account(mut)]
    pub freelancer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"escrow", client.key().as_ref(), freelancer.key().as_ref(), &job_id.to_le_bytes()],
        bump = escrow.bump,
        has_one = client,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init_if_needed,
        payer = client,
        space = Reputation::SPACE,
        seeds = [b"reputation", client.key().as_ref()],
        bump
    )]
    pub client_reputation: Account<'info, Reputation>,

    #[account(
        init_if_needed,
        payer = client,
        space = Reputation::SPACE,
        seeds = [b"reputation", freelancer.key().as_ref()],
        bump
    )]
    pub freelancer_reputation: Account<'info, Reputation>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub job_id: u64,
    pub amount_lamports: u64,
}

#[event]
pub struct EscrowReleased {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub amount_lamports: u64,
    pub client_score: u64,
    pub freelancer_score: u64,
}

#[error_code]
pub enum TrustChainError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid escrow status")]
    InvalidStatus,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Freelancer does not match escrow")]
    InvalidFreelancer,
    #[msg("Escrow account has insufficient balance")]
    InsufficientEscrowBalance,
}


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
        total_milestones: u8,
    ) -> Result<()> {
        require!(amount_lamports > 0, TrustChainError::InvalidAmount);
        require!(total_milestones > 0, TrustChainError::InvalidMilestones);
        require!(
            amount_lamports >= total_milestones as u64,
            TrustChainError::InvalidMilestones
        );

        let escrow = &mut ctx.accounts.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.freelancer = ctx.accounts.freelancer.key();
        escrow.job_id = job_id;
        escrow.amount_lamports = amount_lamports;
        escrow.amount_released_lamports = 0;
        escrow.total_milestones = total_milestones;
        escrow.released_milestones = 0;
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
            total_milestones,
        });

        Ok(())
    }

    pub fn approve_milestone(ctx: Context<ApproveMilestone>, _job_id: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(
            escrow.status == EscrowStatus::Funded || escrow.status == EscrowStatus::InProgress,
            TrustChainError::InvalidStatus
        );
        require_keys_eq!(escrow.client, ctx.accounts.client.key(), TrustChainError::Unauthorized);
        require_keys_eq!(
            escrow.freelancer,
            ctx.accounts.freelancer.key(),
            TrustChainError::InvalidFreelancer
        );
        require!(
            escrow.released_milestones < escrow.total_milestones,
            TrustChainError::InvalidStatus
        );

        let next_milestone = escrow.released_milestones.saturating_add(1);
        let is_final_milestone = next_milestone == escrow.total_milestones;
        let base_milestone_amount = escrow
            .amount_lamports
            .checked_div(escrow.total_milestones as u64)
            .ok_or(TrustChainError::InvalidMilestones)?;
        let amount = if is_final_milestone {
            escrow
                .amount_lamports
                .checked_sub(escrow.amount_released_lamports)
                .ok_or(TrustChainError::InvalidAmount)?
        } else {
            base_milestone_amount
        };

        require!(amount > 0, TrustChainError::InvalidMilestoneAmount);
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

        escrow.released_milestones = next_milestone;
        escrow.amount_released_lamports = escrow.amount_released_lamports.saturating_add(amount);
        escrow.status = if is_final_milestone {
            EscrowStatus::Released
        } else {
            EscrowStatus::InProgress
        };

        let mut client_score = ctx.accounts.client_reputation.score;
        let mut freelancer_score = ctx.accounts.freelancer_reputation.score;

        if is_final_milestone {
            let client_rep = &mut ctx.accounts.client_reputation;
            let freelancer_rep = &mut ctx.accounts.freelancer_reputation;

            client_rep.user = escrow.client;
            freelancer_rep.user = escrow.freelancer;

            client_rep.completed_jobs = client_rep.completed_jobs.saturating_add(1);
            freelancer_rep.completed_jobs = freelancer_rep.completed_jobs.saturating_add(1);

            // Simple hackathon scoring rule: +1 point per completed job.
            client_rep.score = client_rep.score.saturating_add(1);
            freelancer_rep.score = freelancer_rep.score.saturating_add(1);

            client_score = client_rep.score;
            freelancer_score = freelancer_rep.score;
        }

        emit!(MilestoneApproved {
            escrow: escrow.key(),
            client: escrow.client,
            freelancer: escrow.freelancer,
            amount_lamports: amount,
            released_milestones: escrow.released_milestones,
            total_milestones: escrow.total_milestones,
            client_score,
            freelancer_score,
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
pub struct ApproveMilestone<'info> {
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
    pub total_milestones: u8,
}

#[event]
pub struct MilestoneApproved {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub amount_lamports: u64,
    pub released_milestones: u8,
    pub total_milestones: u8,
    pub client_score: u64,
    pub freelancer_score: u64,
}

#[error_code]
pub enum TrustChainError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid milestone count")]
    InvalidMilestones,
    #[msg("Milestone amount is too small")]
    InvalidMilestoneAmount,
    #[msg("Invalid escrow status")]
    InvalidStatus,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Freelancer does not match escrow")]
    InvalidFreelancer,
    #[msg("Escrow account has insufficient balance")]
    InsufficientEscrowBalance,
}

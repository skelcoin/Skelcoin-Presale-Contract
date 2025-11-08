use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("BVNaf3L1ugpYGxjkbT7qmz17bmjPJGvVJVfo5QABPPgk");

#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid admin")]
    InvalidAdmin,
    #[msg("ICO is currently paused")]
    IcoPaused,
    #[msg("ICO has not started yet")]
    IcoNotStarted,
    #[msg("ICO has already ended")]
    IcoEnded,
    #[msg("ICO account not holding this much token")]
    InsufficientTokens,
}

#[program]
pub mod ico {
    use super::*;

    pub const TOKEN_DECIMALS: u64 = 1_000_000_000; // 10^9 for SPL token decimals

    pub fn create_ico_ata(
        ctx: Context<CreateIcoATA>,
        ico_amount: u64,
        initial_price: u64, // in USDC
        start_time: i64,
        end_time: i64,
    ) -> Result<()> {
        msg!("Creating program ATA to hold ICO tokens");

        // Transfer tokens from admin ATA to program ATA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.ico_ata_for_admin.to_account_info(),
                to: ctx.accounts.ico_ata_for_ico_program.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, ico_amount)?;
        msg!("Transferred {} ICO tokens to program ATA", ico_amount);

        // Initialize data
        let data = &mut ctx.accounts.data;
        data.admin = *ctx.accounts.admin.key;
        data.total_tokens = ico_amount;
        data.tokens_sold = 0;
        data.price_per_token = initial_price;
        data.paused = false;
        data.start_time = start_time;
        data.end_time = end_time;

        msg!("Initialized ICO data");
        Ok(())
    }

    pub fn deposit_ico_in_ata(ctx: Context<DepositIcoInATA>, ico_amount: u64) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.ico_ata_for_admin.to_account_info(),
                to: ctx.accounts.ico_ata_for_ico_program.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, ico_amount)?;

        let data = &mut ctx.accounts.data;
        data.total_tokens = data
            .total_tokens
            .checked_add(ico_amount)
            .ok_or(ErrorCode::Overflow)?;

        msg!("Deposited {} additional ICO tokens", ico_amount);
        Ok(())
    }

    pub fn withdraw_ico_from_ata(ctx: Context<WithdrawIcoInATA>, ico_amount: u64) -> Result<()> {
     
        if ico_amount > ctx.accounts.data.total_tokens {
            return Err(error!(ErrorCode::InsufficientTokens));
        }

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.ico_ata_for_admin.to_account_info(),
                to: ctx.accounts.ico_ata_for_ico_program.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, ico_amount)?;

        let data = &mut ctx.accounts.data;
        data.total_tokens = data
            .total_tokens
            .checked_sub(ico_amount)
            .ok_or(ErrorCode::Overflow)?;

        msg!("Witdran {} additional ICO tokens", ico_amount);
        Ok(())
    }

    pub fn buy_tokens(
        ctx: Context<BuyTokens>,
        _ico_ata_for_ico_program_bump: u8,
        usdc_amount: u64,
    ) -> Result<()> {
        let data = &mut ctx.accounts.data;

        // Check paused
        require!(!data.paused, ErrorCode::IcoPaused);

        // Check time window
        let now = Clock::get()?.unix_timestamp;
        require!(now >= data.start_time, ErrorCode::IcoNotStarted);
        require!(now <= data.end_time, ErrorCode::IcoEnded);

        // require!(ctx.accounts.stable_coin.key() == USDC_ADDRESS || ctx.accounts.stable_coin.key() == USDT_ADDRESS, PresaleError::InvalidStableToken);

        let token_amount = usdc_amount
            .checked_div(data.price_per_token)
            .ok_or(ErrorCode::Overflow)?;

        if data.total_tokens < token_amount {
            return Err(error!(ErrorCode::InsufficientTokens));
        }

        // 1. Transfer USDC from user → admin
        let cpi_ctx_usdc = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.usdc_ata_for_user.to_account_info(),
                to: ctx.accounts.usdc_ata_for_admin.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(cpi_ctx_usdc, usdc_amount)?;

        msg!("Transferred {} USDC to admin", usdc_amount);

        // Transfer tokens from program to user using raw amount (with decimals)
        let ico_mint_address = ctx.accounts.ico_mint.key();
        let seeds = &[ico_mint_address.as_ref(), &[_ico_ata_for_ico_program_bump]];
        let signer = [&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.ico_ata_for_ico_program.to_account_info(),
                to: ctx.accounts.ico_ata_for_user.to_account_info(),
                authority: ctx.accounts.ico_ata_for_ico_program.to_account_info(),
            },
            &signer,
        );
        token::transfer(cpi_ctx, token_amount)?;
        // Update sold tokens
        data.tokens_sold = data
            .tokens_sold
            .checked_add(token_amount)
            .ok_or(ErrorCode::Overflow)?;

        msg!("Transferred {} tokens to buyer", token_amount);
        Ok(())
    }

    pub fn update_price(ctx: Context<AdminOnly>, new_price: u64) -> Result<()> {
        ctx.accounts.data.price_per_token = new_price;
        msg!("Price updated to {} lamports per token", new_price);
        Ok(())
    }

    pub fn set_pause(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.data.paused = paused;
        msg!("ICO paused status set to: {}", paused);
        Ok(())
    }

    pub fn set_ico_time(ctx: Context<AdminOnly>, start_time: i64, end_time: i64) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.data.admin,
            ctx.accounts.admin.key(),
            ErrorCode::InvalidAdmin
        );
        ctx.accounts.data.start_time = start_time;
        ctx.accounts.data.end_time = end_time;
        msg!("ICO time window set: {} -> {}", start_time, end_time);
        Ok(())
    }
    pub fn change_admin(ctx: Context<ChangeAdmin>, new_admin: Pubkey) -> Result<()> {
        let data = &mut ctx.accounts.data;
        data.admin = new_admin;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateIcoATA<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [ico_mint.key().as_ref()],
        bump,
        token::mint = ico_mint,
        token::authority = ico_ata_for_ico_program,
    )]
    pub ico_ata_for_ico_program: Account<'info, TokenAccount>,

    #[account(init, payer = admin, space = 8 + Data::INIT_SPACE, seeds = [b"data", admin.key().as_ref()], bump)]
    pub data: Account<'info, Data>,

    pub ico_mint: Account<'info, Mint>,

    #[account(mut)]
    pub ico_ata_for_admin: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DepositIcoInATA<'info> {
    #[account(mut)]
    pub ico_ata_for_ico_program: Account<'info, TokenAccount>,

    #[account(mut)]
    pub data: Account<'info, Data>,

    pub ico_mint: Account<'info, Mint>,

    #[account(mut)]
    pub ico_ata_for_admin: Account<'info, TokenAccount>,

    #[account(mut,
    constraint = data.admin == *admin.key @ErrorCode::InvalidAdmin
)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawIcoInATA<'info> {
    #[account(mut)]
    pub ico_ata_for_ico_program: Account<'info, TokenAccount>,

    #[account(mut)]
    pub data: Account<'info, Data>,

    pub ico_mint: Account<'info, Mint>,

    #[account(mut)]
    pub ico_ata_for_admin: Account<'info, TokenAccount>,

    #[account(mut,
    constraint = data.admin == *admin.key @ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(_ico_ata_for_ico_program_bump: u8)]
pub struct BuyTokens<'info> {
    #[account(mut, seeds = [ico_mint.key().as_ref()], bump = _ico_ata_for_ico_program_bump)]
    pub ico_ata_for_ico_program: Account<'info, TokenAccount>,

    #[account(mut)]
    pub data: Account<'info, Data>,

    pub ico_mint: Account<'info, Mint>,

    #[account(mut)]
    pub ico_ata_for_user: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = user
    )]
    pub usdc_ata_for_user: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint= usdc_mint,
        associated_token::authority=admin
    )]
    pub usdc_ata_for_admin: Account<'info, TokenAccount>,

    /// CHECK: just passed as admin
    #[account(mut,
    constraint = data.admin == *admin.key @ErrorCode::InvalidAdmin)]
    pub admin: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
#[derive(Accounts)]
pub struct ChangeAdmin<'info> {
    #[account(
    mut,
    constraint = data.admin == *admin.key @ErrorCode::InvalidAdmin
     )]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub data: Account<'info, Data>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut)]
    pub data: Account<'info, Data>,

    #[account(mut,
    constraint = data.admin == *admin.key @ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>
}

#[account]
#[derive(InitSpace, Debug)]
pub struct Data {
    pub admin: Pubkey,
    pub total_tokens: u64,
    pub tokens_sold: u64,
    pub price_per_token: u64,
    pub paused: bool,
    pub start_time: i64,
    pub end_time: i64,
}

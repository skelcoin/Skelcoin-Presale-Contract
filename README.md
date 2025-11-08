# 🪙 Skelcoin ICO Program

A Solana-based **ICO (Initial Coin Offering)** smart contract built using the **Anchor framework**.  
This program enables an admin to manage token presales, allowing users to purchase project tokens using USDC (or another stablecoin).

---

## 🚀 Features

- **Admin-controlled ICO lifecycle**
  - Create and configure ICO pool
  - Deposit or withdraw ICO tokens
  - Start, pause, or stop the ICO
  - Update token price or ICO timings  
- **User participation**
  - Buy tokens using USDC (or another stablecoin)
- **Security checks**
  - Admin validation
  - Overflow protection
  - ICO time window validation
  - Pause control
- **Built with Anchor**
  - Easy integration with frontends and scripts

---

## 🧱 Program Overview

| Function | Description |
|-----------|--------------|
| `create_ico_ata` | Initializes the ICO by creating the program’s token account (ATA), transferring tokens from admin to the program, and setting initial data. |
| `deposit_ico_in_ata` | Allows the admin to deposit more tokens into the ICO pool. |
| `withdraw_ico_from_ata` | Allows the admin to withdraw unsold tokens. |
| `buy_tokens` | Allows users to buy tokens using USDC, with time and pause validations. |
| `update_price` | Updates the price per token. |
| `set_pause` | Pauses or resumes the ICO. |
| `set_ico_time` | Updates the start and end time of the ICO. |
| `change_admin` | Transfers admin rights to another wallet. |

---

## ⚙️ Data Account Structure

| Field | Type | Description |
|--------|------|-------------|
| `admin` | `Pubkey` | Admin wallet authorized to manage the ICO. |
| `total_tokens` | `u64` | Total tokens allocated for sale. |
| `tokens_sold` | `u64` | Total tokens sold. |
| `price_per_token` | `u64` | Price in stablecoin (e.g. USDC) per token. |
| `paused` | `bool` | Pause state of the ICO. |
| `start_time` | `i64` | Start timestamp of ICO. |
| `end_time` | `i64` | End timestamp of ICO. |

---

## 🧰 Error Codes

| Error Code | Description |
|-------------|-------------|
| `Overflow` | Arithmetic overflow occurred. |
| `InvalidAdmin` | Caller is not authorized as admin. |
| `IcoPaused` | ICO is paused. |
| `IcoNotStarted` | ICO hasn’t started yet. |
| `IcoEnded` | ICO has ended. |
| `InsufficientTokens` | Not enough tokens in ICO pool. |

---

## 🪙 Example Flow

1. **Admin creates ICO:**
   ```bash
   anchor test -- --features create_ico_ata
   ```
   - Transfers project tokens from admin → program’s ATA  
   - Sets price, start/end time, and other parameters  

2. **Users buy tokens:**
   ```bash
   anchor test -- --features buy_tokens
   ```
   - Users send USDC → Admin  
   - Program sends ICO tokens → User  

3. **Admin manages ICO:**
   - Pause/resume sale with `set_pause`
   - Adjust price with `update_price`
   - Extend sale time with `set_ico_time`
   - Withdraw leftover tokens with `withdraw_ico_from_ata`

---

## 📦 Accounts Overview

### 📍 Create ICO ATA
| Account | Description |
|----------|-------------|
| `ico_ata_for_ico_program` | Program-owned ATA for token sale |
| `ico_ata_for_admin` | Admin's token account |
| `data` | ICO configuration data account |
| `ico_mint` | Token mint being sold |
| `admin` | ICO admin |
| `system_program`, `token_program`, `rent` | Standard Solana programs |

---

## 🧑‍💻 Build & Deploy

### Prerequisites
- Rust
- Solana CLI
- Anchor CLI

### Build
```bash
anchor build
```

### Deploy
```bash
anchor deploy
```

### Local Test
```bash
anchor test
```

---

## 🔐 Security Notes

- Only the `admin` can:
  - Create, deposit, withdraw, or pause ICO
  - Change price or time window  
- Overflow and time checks prevent invalid operations  
- Users can only buy within the valid ICO window  

---

## 📜 License

MIT License © 2025 — **Skelcoin Team**

import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { SystemProgram, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { Ico } from "../target/types/ico";
import BN from "bn.js";

describe("ICO Full Flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // @ts-ignore
  const program = anchor.workspace.Ico as anchor.Program<Ico>;
  const connection = provider.connection;

  const admin = provider.wallet.payer;
  const buyer = Keypair.generate();

  const DECIMALS = 9;
  const ONE_UNIT = new BN(10).pow(new BN(DECIMALS));

  // Mints
  let icoMint: Keypair;
  let usdcMint: Keypair;

  // ATAs
  let adminIcoAta: PublicKey;
  let buyerIcoAta: PublicKey;
  let adminUsdcAta: PublicKey;
  let buyerUsdcAta: PublicKey;
  let programIcoAta: PublicKey;

  // PDAs
  let dataPDA: PublicKey;
  let icoBump: number;

  // Config
  const ICO_SUPPLY = new BN(10_000).mul(ONE_UNIT);
  const PRICE_PER_TOKEN = new BN(1_000_000); // 0.001 stable
  const USDC_BUY_AMOUNT = new BN(10).mul(ONE_UNIT);
  const now = Math.floor(Date.now() / 1000);
  const START_TIME = now - 60;
  const END_TIME = now + 86400;

  before(async () => {
    // Airdrop buyer some SOL
    await connection.confirmTransaction(
      await connection.requestAirdrop(buyer.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    // Create ICO mint & USDC mint
    icoMint = Keypair.generate();
    usdcMint = Keypair.generate();

    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    const createMint = async (mint: Keypair) => {
      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: admin.publicKey,
          newAccountPubkey: mint.publicKey,
          space: 82,
          lamports: mintRent,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mint.publicKey, DECIMALS, admin.publicKey, null)
      );
      await provider.sendAndConfirm(tx, [mint]);
    };
    await createMint(icoMint);
    await createMint(usdcMint);

    // Create ATAs
    adminIcoAta = (await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      icoMint.publicKey,
      admin.publicKey
    )).address;

    buyerUsdcAta = (await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      usdcMint.publicKey,
      buyer.publicKey
    )).address;

    adminUsdcAta = (await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      usdcMint.publicKey,
      admin.publicKey
    )).address;

    // Mint ICO supply to admin
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(icoMint.publicKey, adminIcoAta, admin.publicKey, ICO_SUPPLY.toNumber())
      ),
      [admin]
    );

    // Mint USDC to buyer
    await provider.sendAndConfirm(
      new Transaction().add(
        createMintToInstruction(usdcMint.publicKey, buyerUsdcAta, admin.publicKey, USDC_BUY_AMOUNT.toNumber())
      ),
      [admin]
    );

    // Derive PDAs
    [programIcoAta, icoBump] = PublicKey.findProgramAddressSync(
      [icoMint.publicKey.toBuffer()],
      program.programId
    );
    [dataPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("data"), admin.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Create ICO ATA + Initialize Data", async () => {
    await program.methods
      .createIcoAta(
        new BN(ICO_SUPPLY),
        new BN(PRICE_PER_TOKEN),
        new BN(START_TIME),
        new BN(END_TIME)
      )
      .accounts({
        icoAtaForIcoProgram: programIcoAta,
        data: dataPDA,
        icoMint: icoMint.publicKey,
        icoAtaForAdmin: adminIcoAta,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(dataAcc.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(dataAcc.totalTokens.toString(), ICO_SUPPLY.toString());
  });

  it("Deposit additional ICO tokens", async () => {
    const extra = new BN(100).mul(ONE_UNIT);
    await program.methods
      .depositIcoInAta(extra)
      .accounts({
        icoAtaForIcoProgram: programIcoAta,
        data: dataPDA,
        icoMint: icoMint.publicKey,
        icoAtaForAdmin: adminIcoAta,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(
      dataAcc.totalTokens.toString(),
      ICO_SUPPLY.add(extra).toString(),
      "Deposit failed"
    );
  });

  it("Withdraw ICO tokens", async () => {
    const withdraw = new BN(50).mul(ONE_UNIT);
    await program.methods
      .withdrawIcoFromAta(withdraw)
      .accounts({
        icoAtaForIcoProgram: programIcoAta,
        data: dataPDA,
        icoMint: icoMint.publicKey,
        icoAtaForAdmin: adminIcoAta,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(
      dataAcc.totalTokens.toString(),
      ICO_SUPPLY.add(new BN(100).mul(ONE_UNIT)).sub(withdraw).toString()
    );
  });

  it("Buyer buys tokens", async () => {
    buyerIcoAta = await getAssociatedTokenAddress(icoMint.publicKey, buyer.publicKey);
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        buyer.publicKey,
        buyerIcoAta,
        buyer.publicKey,
        icoMint.publicKey
      )
    );
    await provider.sendAndConfirm(createAtaTx, [buyer]);

    const beforeBuyerUsdc = await connection.getTokenAccountBalance(buyerUsdcAta);

    await program.methods
      .buyTokens(icoBump, new BN(USDC_BUY_AMOUNT))
      .accounts({
        icoAtaForIcoProgram: programIcoAta,
        data: dataPDA,
        icoMint: icoMint.publicKey,
        icoAtaForUser: buyerIcoAta,
        user: buyer.publicKey,
        usdcAtaForUser: buyerUsdcAta,
        usdcMint: usdcMint.publicKey,
        usdcAtaForAdmin: adminUsdcAta,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const afterBuyerUsdc = await connection.getTokenAccountBalance(buyerUsdcAta);
    assert.ok(
      new BN(afterBuyerUsdc.value.amount).lt(new BN(beforeBuyerUsdc.value.amount)),
      "Buyer USDC not reduced"
    );

    const buyerIcoBal = await connection.getTokenAccountBalance(buyerIcoAta);
    assert.ok(
      new BN(buyerIcoBal.value.amount).gt(new BN(0)),
      "Buyer ICO tokens not received"
    );
  });

  it("Admin updates price", async () => {
    const newPrice = new BN(2_000_000);
    await program.methods
      .updatePrice(newPrice)
      .accounts({
        data: dataPDA,
        admin: admin.publicKey,
      })
      .rpc();

    const dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(dataAcc.pricePerToken.toString(), newPrice.toString());
  });

  it("Admin pauses and resumes ICO", async () => {
    await program.methods
      .setPause(true)
      .accounts({ data: dataPDA, admin: admin.publicKey })
      .rpc();

    let dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(dataAcc.paused, true, "Pause failed");

    await program.methods
      .setPause(false)
      .accounts({ data: dataPDA, admin: admin.publicKey })
      .rpc();

    dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(dataAcc.paused, false, "Unpause failed");
  });

  it("Admin sets ICO time window", async () => {
    const newStart = now - 100;
    const newEnd = now + 200000;
    await program.methods
      .setIcoTime(new BN(newStart), new BN(newEnd))
      .accounts({ data: dataPDA, admin: admin.publicKey })
      .rpc();

    const dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(dataAcc.startTime.toString(), newStart.toString());
    assert.equal(dataAcc.endTime.toString(), newEnd.toString());
  });

  it("Admin changes admin", async () => {
    const newAdmin = Keypair.generate().publicKey;

    await program.methods
      .changeAdmin(newAdmin)
      .accounts({ admin: admin.publicKey, data: dataPDA })
      .rpc();

    const dataAcc = await program.account.data.fetch(dataPDA);
    assert.equal(dataAcc.admin.toBase58(), newAdmin.toBase58(), "Admin not changed");
  });
});

import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, getAccount, createMintToInstruction, createInitializeMintInstruction } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { Transaction } from "@solana/web3.js";
import type { Ico } from "../target/types/ico";
import pkg from '@coral-xyz/anchor';
const { Program, BN } = pkg;

describe("ICO Program Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  // @ts-ignore
  const program = anchor.workspace.Ico as Program<Ico>;
  const connection = provider.connection;

  const admin = provider.wallet.payer;
  const buyer = Keypair.generate();


  

  let icoMint: Keypair;
  let adminATA: PublicKey;
  let buyerATA: PublicKey;
  let icoATA: PublicKey;
  let dataPDA: PublicKey;
  let icoATABump: number;
  let dataBump: number;

  let usdcMint: Keypair;
  let buyerUSDCATA: PublicKey;
  let adminUSDCATA: PublicKey;

  const ICO_AMOUNT = new BN(10000);
  const BUY_AMOUNT = 10 * 1_000_000_000; 
  const TOKEN_DECIMALS = new BN(1_000_000_000);

  const now = Math.floor(Date.now() / 1000);
  const START_TIME = new BN(now);
  const END_TIME = new BN(now + 86400);
  const INITIAL_PRICE = new BN(1_000_000_000 * 0.001); // lamports per token

  before(async () => {


       const Airdropped = 500000 * 2
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: buyer.publicKey,
        lamports: Airdropped * LAMPORTS_PER_SOL, // amount to send
      })
    );
    await program.provider.sendAndConfirm(tx, [admin]);
    console.log("airdrop done to buyer");
    

    // 1️⃣ Create a mint
    icoMint = Keypair.generate();
    usdcMint = Keypair.generate();
    console.log("runing mint");


    // mint presale token 
    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    const mintTx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: icoMint.publicKey,
        space: 82,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        icoMint.publicKey,
        9, // decimals
        admin.publicKey,
        admin.publicKey,
        TOKEN_PROGRAM_ID,
      )
    );
    await provider.sendAndConfirm(mintTx, [icoMint]);

    console.log("done mint");
    console.log("Create admin ATA");

    // 2️⃣ Create admin ATA
    const adminATAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      icoMint.publicKey,
      admin.publicKey
    );
    adminATA = adminATAAccount.address;
    console.log(" 3️⃣ Mint tokens to admin");
    // 3️⃣ Mint tokens to admin
    await program.provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createMintToInstruction(
          icoMint.publicKey,
          adminATA,
          admin.publicKey,
          10000 * 1_000_000_000,
          [],
          TOKEN_PROGRAM_ID,
        )
      )
    );
    console.log(" 3️⃣ finished presale ");

    console.log("Create USDC Token");
    const usdcMintRent = await connection.getMinimumBalanceForRentExemption(82);
    const usdcTx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: usdcMint.publicKey,
        space: 82,
        lamports: usdcMintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        usdcMint.publicKey,
        9, // USDC usually has 6 decimals
        admin.publicKey,
        admin.publicKey,
        TOKEN_PROGRAM_ID,
      )
    );
    await provider.sendAndConfirm(usdcTx, [usdcMint]);


    console.log("USDC done..");


    console.log("create buyer ata for usdc,,");

    // 2️⃣ Create buyer ATA
    const userUSDCATAACCOUNT = await getOrCreateAssociatedTokenAccount(
      connection,
      buyer,
      usdcMint.publicKey,
      buyer.publicKey
    );
    buyerUSDCATA = userUSDCATAACCOUNT.address;  // buyer etr
    console.log(" 3️⃣ Mint tokens to admin");
    // 3️⃣ Mint tokens to admin
    await program.provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createMintToInstruction(
          usdcMint.publicKey,
          buyerUSDCATA,
          admin.publicKey, // signer must match mint authority
          100 * 1_000_000_000, // if decimals=6
          [],
          TOKEN_PROGRAM_ID
        )
      ),
      [admin]
    );
    console.log("done usdc eta for buyer ");


    // 2️⃣ Create admin ATA
    const adminUSDCATAACCOUNT = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      usdcMint.publicKey,
      admin.publicKey
    );
    adminUSDCATA = adminUSDCATAACCOUNT.address;  // buyer etr
    console.log(" 3️⃣ Mint tokens to admin");
    // 3️⃣ Mint tokens to admin
    await program.provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        createMintToInstruction(
          usdcMint.publicKey,
          adminUSDCATA,
          admin.publicKey, // signer must match mint authority
          100 * 1_000_000, // if decimals=6
          [],
          TOKEN_PROGRAM_ID
        )
      ),
      [admin]
    );


  });

  it("Initialize ICO ATA and PDA", async () => {
    console.log("ico eta");


    [icoATA] = PublicKey.findProgramAddressSync(
      [icoMint.publicKey.toBuffer()],
      program.programId
    );
    console.log("data eta", icoATA);
    [dataPDA, dataBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("data"), admin.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .createIcoAta(ICO_AMOUNT, INITIAL_PRICE, START_TIME, END_TIME)
      .accounts({
        icoAtaForIcoProgram: icoATA,
        data: dataPDA,
        icoMint: icoMint.publicKey,
        icoAtaForAdmin: adminATA,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const data = await program.account.data.fetch(dataPDA);

    console.log(data, "created ico data");



  });

  it("Buyer purchases tokens from ICO", async () => {

 

    console.log("Airdropped  SOL to buyer");

    console.log("Creating buyer ATA");

    try {
      buyerATA = await getAssociatedTokenAddress(
        icoMint.publicKey,
        buyer.publicKey
      );

      // 1️⃣ Build the transaction
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          buyer.publicKey, // funding payer
          buyerATA,        // ATA address
          buyer.publicKey, // owner of ATA
          icoMint.publicKey
        )
      );

      // 2️⃣ Send & confirm with signers
      await program.provider.sendAndConfirm(tx, [buyer]);
      console.log("Buyer ATA created:", buyerATA.toBase58());
    } catch (error) {
      console.log(error);

    }
    console.log("icoATA", icoATA);

    const [icoAtaPda, bump] = await PublicKey.findProgramAddress(
      [icoMint.publicKey.toBuffer()],
      program.programId
    );


    // Convert amount to raw amount with decimals
    const rawBuyAmount = BUY_AMOUNT;

    // Call buy_tokens (Anchor program)
    await program.methods
      .buyTokens(bump, new BN(rawBuyAmount))
      .accounts({
        icoAtaForIcoProgram: icoATA,
        data: dataPDA,
        icoMint: icoMint.publicKey,
        icoAtaForUser: buyerATA,
        user: buyer.publicKey,
        uusdcAtaForUser: buyerUSDCATA,
        usdcMint: usdcMint.publicKey,
        usdcAtaForAdmin: adminUSDCATA,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    console.log(`Buyer bought ${BUY_AMOUNT} tokens`);
    // Fetch updated data
    const data = await program.account.data.fetch(dataPDA);


    console.log("Admin:", data.admin.toBase58());
    console.log("Total Tokens:", data.totalTokens.toString());
    console.log("Tokens Sold:", data.tokensSold.toString());
    console.log("Price per Token (Lamports):", data.pricePerToken.toString());
    console.log("ICO Paused:", data.paused);
    console.log("Start Time:", new Date(Number(data.startTime) * 1000).toLocaleString());
    console.log("End Time:", new Date(Number(data.endTime) * 1000).toLocaleString());

    //const totalTokensHuman = data.total_tokens.toNumber() / 1_000_000_000;
    //const tokensSoldHuman = data.tokens_sold.toNumber() / 1_000_000_000;
    //console.log("Updated tokens sold:", tokensSoldHuman, "of", totalTokensHuman);

    // Check buyer ATA balance
    const buyerBalance = await connection.getTokenAccountBalance(buyerATA);
    console.log("Buyer token balance:", Number(buyerBalance.value.amount),buyerBalance);
  });

  // it("Pauses the contract", async () => {
  //   // Call the pause instruction
  //   const tx = await program.methods
  //     .setPause(true) // Use camelCase if your Rust instruction is `set_pause`
  //     .accounts({
  //       admin: provider.wallet.publicKey,
  //       data: dataPDA, // ⬅️ include if your instruction modifies data in the PDA
  //     }).rpc();

  //   console.log("Transaction Signature:", tx);

  //   // Fetch the updated ICO data
  //   const data = await program.account.data.fetch(dataPDA);
  //   console.log("ICO Paused:", data.paused);

  //   // Optional: add assertion to validate
  //   assert.equal(data.paused, true, "ICO should be paused");


  //   const txs = await program.methods
  //     .setPause(false) // Use camelCase if your Rust instruction is `set_pause`
  //     .accounts({
  //       admin: provider.wallet.publicKey,
  //       data: dataPDA, // ⬅️ include if your instruction modifies data in the PDA
  //     }).rpc();

  //   console.log("Transaction Signature:", txs);


  // });

  // it("Buyer purchases tokens from ICO if it's paused", async () => {

  //   const Airdropped = 500000 * 2
  //   const tx = new Transaction().add(
  //     SystemProgram.transfer({
  //       fromPubkey: admin.publicKey,
  //       toPubkey: buyer.publicKey,
  //       lamports: Airdropped * LAMPORTS_PER_SOL, // amount to send
  //     })
  //   );
  //   await program.provider.sendAndConfirm(tx, [admin]);

  //   console.log("Airdropped  SOL to buyer");

  //   console.log("Creating buyer ATA");

  //   try {
  //     buyerATA = await getAssociatedTokenAddress(
  //       icoMint.publicKey,
  //       buyer.publicKey
  //     );
  //     console.log("Buyer ATA created:", buyerATA.toBase58());
  //   } catch (error) {
  //     console.log(error);

  //   }
  //   console.log("icoATA", icoATA);

  //   const [icoAtaPda, bump] = await PublicKey.findProgramAddress(
  //     [icoMint.publicKey.toBuffer()],
  //     program.programId
  //   );


  //   // Convert amount to raw amount with decimals
  //   const rawBuyAmount = BUY_AMOUNT;

  //   // Call buy_tokens (Anchor program)
  //   await program.methods
  //     .buyTokens(bump, new BN(rawBuyAmount))
  //     .accounts({
  //       icoAtaForIcoProgram: icoATA,
  //       data: dataPDA,
  //       icoMint: icoMint.publicKey,
  //       icoAtaForUser: buyerATA,
  //       user: buyer.publicKey,
  //       admin: admin.publicKey,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .signers([buyer])
  //     .rpc();

  //   console.log(`Buyer bought ${BUY_AMOUNT} tokens`);
  //   // Fetch updated data
  //   const data = await program.account.data.fetch(dataPDA);


  //   console.log("Admin:", data.admin.toBase58());
  //   console.log("Total Tokens:", data.totalTokens.toString());
  //   console.log("Tokens Sold:", data.tokensSold.toString());
  //   console.log("Price per Token (Lamports):", data.pricePerToken.toString());
  //   console.log("ICO Paused:", data.paused);
  //   console.log("Start Time:", new Date(Number(data.startTime) * 1000).toLocaleString());
  //   console.log("End Time:", new Date(Number(data.endTime) * 1000).toLocaleString());

  //   //const totalTokensHuman = data.total_tokens.toNumber() / 1_000_000_000;
  //   //const tokensSoldHuman = data.tokens_sold.toNumber() / 1_000_000_000;
  //   //console.log("Updated tokens sold:", tokensSoldHuman, "of", totalTokensHuman);

  //   // Check buyer ATA balance
  //   const buyerBalance = await connection.getTokenAccountBalance(buyerATA);
  //   console.log("Buyer token balance:", Number(buyerBalance.value.amount) / 1_000_000_000);
  // });

});

// Import necessary functions and constants from the Solana web3.js and SPL Token packages
import {
  sendAndConfirmTransaction,
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  Cluster,
  PublicKey,
} from "@solana/web3.js";

import {
  ExtensionType,
  createInitializeMintInstruction,
  mintTo,
  createAccount,
  getMintLen,
  getTransferFeeAmount,
  unpackAccount,
  TOKEN_2022_PROGRAM_ID,
  createInitializeTransferFeeConfigInstruction,
  harvestWithheldTokensToMint,
  transferCheckedWithFee,
  withdrawWithheldTokensFromAccounts,
  withdrawWithheldTokensFromMint,
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotent,
} from "@solana/spl-token";
import base58 from "bs58";
import dotenv from "dotenv";
dotenv.config();

// https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-fees
// Initialize connection to local Solana node
// CHANGE PASSING RPC FRON ENV
const connection = new Connection("https://api.devnet.solana.com", "confirmed");


//--------- DEFINE THE OWNER WALLET AND THE OTHERS WALLET INVOLVED -------------------------------------------------------------------------
// Generate keys for payer, mint authority, and mint our PRIVATE_KEY
const payer = Keypair.fromSecretKey(base58.decode(process.env.PRIVATE_KEY));

const mintAuthority = payer; // THE MINT AUTHORITY
const mintOwn = payer.publicKey;
const mintKeypair = Keypair.generate(); // GENERATE A NEW ACCOUNT TO MINT THE TOKENS
const mint = mintKeypair.publicKey; // account propietario della Mint Authority

const owner = payer; // THE OWNER OF THE TOKENS

// Generate keys for transfer fee CONFIG AUTHORITY and WITHDRAW AUTHORITY
const transferFeeConfigAuthority = mintOwn;   // THE WALLET CAN CHANGE THE SETTINS FOR THIS TOKEN
const withdrawWithheldAuthority = mintOwn;  // THE WITHDRAW AUTHORITY ( WHIC WALLET CAN WITHRAW THE FEES)


//--------- DEFINE THE EXTENSIONS --------------------------------------------------------------------------------------------------------------


// Define the extensions to be used by the mint
const extensions = [ExtensionType.TransferFeeConfig];

// Calculate the length of the mint
const mintLen = getMintLen(extensions);

// Set the decimals, fee basis points, and maximum fee
const decimals = 9;
const feeBasisPoints = 100* 30; // 10%
const maxFee = BigInt(100000 * Math.pow(10, decimals)); // 1000 tokens
// aggiungere max fee transfer


// Define the amount to be minted and the amount to be transferred, accounting for decimals
const mintAmount = BigInt(1_000_000 * Math.pow(10, decimals)); // Mint 1,000,000 tokens
const transferAmount = BigInt(1_000 * Math.pow(10, decimals)); // Transfer 1,000 tokens

// Calculate the fee for the transfer
const calcFee = (transferAmount * BigInt(feeBasisPoints)) / BigInt(10_000); // expect 10 fee
const fee = calcFee > maxFee ? maxFee : calcFee; // expect 9 fee

// Helper function to generate Explorer URL
function generateExplorerTxUrl(txId: string) {
  return `https://explorer.solana.com/tx/${txId}?cluster=devnet`;
}
let balanceInfoFee ;
async function checkTokenBalance(connection, feeVault) {
  let balanceInfo;
  try {
    // Ottieni il saldo del token dall'account associato
     balanceInfo= await connection.getTokenAccountBalance(
      feeVault
    );

   
    console.log("Token balance in ui:", balanceInfo.value.uiAmount);
    console.log("Token balance:", balanceInfo.value.amount);
    balanceInfoFee = balanceInfo.value.uiAmount; 
    return  balanceInfo.value.uiAmount; // Restituisce l'importo del saldo;
  } catch (error) {
    console.error("Errore nel controllo del saldo del token:", error);
    throw error; // Rilancia l'errore per la gestione
  }
};

async function main() {
  // Step 0 - Airdrop to Payer ( FOR TEST PURPOSE ON DEVNET)
  //  console.log("Step 0 - Airdrop to Payer - Passed!");
  // const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
  // await connection.confirmTransaction({ signature: airdropSignature, ...(await connection.getLatestBlockhash()) });
  
  // Step 1 - Create a New Token
  console.log("Step 1 - Create a New Token");
  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  const mintTransaction = new Transaction().add(
    // I CREATE A NEW ACCOUNT USING THE MINT ACCOUNT CREATED ABOVE
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint, 
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // I CREATE A TRANFER FEE CONFIG
    createInitializeTransferFeeConfigInstruction(
      mint,
      transferFeeConfigAuthority, 
      withdrawWithheldAuthority,
      feeBasisPoints,
      maxFee,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(mint, decimals, mintAuthority.publicKey, null, TOKEN_2022_PROGRAM_ID)
  );
  const newTokenTx = await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair], undefined); // SEND THE TRANSACTION 
  console.log("New Token Created:", generateExplorerTxUrl(newTokenTx));
  console.log("Mint KeyPair: ", mintKeypair);
  console.log("Mint wallet: ", mintKeypair.publicKey);

  // Step 2 - Mint tokens to Owner
  console.log("Step 2 - Mint tokens to Owner");
  const sourceAccount = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    owner.publicKey,
    {},
    TOKEN_2022_PROGRAM_ID
  );
  const mintSig = await mintTo(
    connection,
    payer,
    mint,
    sourceAccount,
    mintAuthority,
    mintAmount,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("Tokens Minted:", generateExplorerTxUrl(mintSig));


  // Step 3 - Send Tokens from Owner to a New Account
  console.log("Step 3 - Send Tokens to 3 New Account:");
  for(let i=0; i < 3; i++){
      const destinationOwner = Keypair.generate();
      console.log("Keypair generated for the new Holder:", destinationOwner );
      console.log(destinationOwner);
      const destinationAccount = await createAssociatedTokenAccountIdempotent(
        connection,
        payer,
        mint,
        destinationOwner.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );
      const transferSig = await transferCheckedWithFee(
        connection,
        payer,
        sourceAccount,
        mint,
        destinationAccount,
        owner,
        transferAmount,
        decimals,
        fee,
        []
      );
      console.log("Tokens Transfered:", generateExplorerTxUrl(transferSig));
    }


  //-------------------------------- CALCULATE THE HOLDERS OF THE TOKENS AND PUT THE ADRESSES IN AN ARRAY -----------------------------------------------------

  // Step 5 - Fetch Fee Accounts
  const allAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: mint.toString(),
        },
      },
    ],
  });

  const accountsToWithdrawFrom: PublicKey[] = [];
  for (const accountInfo of allAccounts) {
    const account = unpackAccount(accountInfo.pubkey, accountInfo.account, TOKEN_2022_PROGRAM_ID);
    const transferFeeAmount = getTransferFeeAmount(account);
    if (transferFeeAmount !== null && transferFeeAmount.withheldAmount > BigInt(0)) {
      accountsToWithdrawFrom.push(accountInfo.pubkey);
    }
  }

  console.log("holders:", accountsToWithdrawFrom);

  
  // Step 6 - Harvest Fees where I pass a wallet where I want to withdraw the fees
  console.log("Step 6 - Harvest Fees");
  //------------------------------------------------ WITHDRAW FEES ----------------------------------------------------------------------------------------------------
 

  const feeVault = Keypair.generate(); // ACCOUNT WHERE I DEPOSIT THE WHITDRAWED FEES 
  // USE LOTTERY CONTRACT
  console.log("nuovo account creato dove deposito i token", feeVault.publicKey);
  // console.log("Keys: ", feeVault);
  const feeVaultAccount = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    feeVault.publicKey,
    {},
    TOKEN_2022_PROGRAM_ID
  );

  const withdrawSig1 = await withdrawWithheldTokensFromAccounts(
    connection,
    payer,
    mint,
    feeVaultAccount,
    withdrawWithheldAuthority,
    [],
    accountsToWithdrawFrom
  );
  console.log("Withdraw from Accounts:", generateExplorerTxUrl(withdrawSig1));

  
  //------------------------------------------------ WITHDRAW FEES ----------------------------------------------------------------------------------------------------
  
  
  // controllo quanti token sono nel wallet e li inserisco in una variabile
  let balanceInfo = await checkTokenBalance(connection, feeVaultAccount) ;
   const tokenToSend = 900000000000 / 1000000000;
  const transferAmountToWithdraw = BigInt(balanceInfoFee * Math.pow(10, decimals)); // Transfer 1,000 tokens
  console.log("trasferAmount 1_000: ",transferAmountToWithdraw);

  // Calculate the fee for the transfer
  const calcFeeToWithdraw = (transferAmountToWithdraw * BigInt(feeBasisPoints)) / BigInt(10_000); // expect 10 fee
  const feeToWithdraw = calcFeeToWithdraw > maxFee ? maxFee : calcFee; // expect 9 fee


/*
  // trasferire i troken a un altro wallet -> lottery wallet C7zMLHuh7hYLZqrpwJ78SgZw4xFkRsSwEVdgtFQj4cWs
  const lotteryWallet = Keypair.generate();
  console.log("Keypair generated for the new Holder:", lotteryWallet );
  console.log(lotteryWallet);
  const destinationAccount = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    lotteryWallet.publicKey,
    {},
    TOKEN_2022_PROGRAM_ID
  );
  const transferSig = await transferCheckedWithFee(
    connection,
    payer,
    sourceAccount,
    mint,
    destinationAccount,
    owner,
    transferAmountToWithdraw,
    decimals,
    fee,
    []
  );
  console.log("Tokens Transfered:", generateExplorerTxUrl(transferSig));
*/

  
}

// Execute the main function
main();

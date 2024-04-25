import {
    clusterApiUrl,
    sendAndConfirmTransaction,
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';

import {
    ExtensionType,
    createInitializeMintInstruction,
    mintTo,
    createAccount,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import base58 from "bs58";
import {
    createInitializeTransferFeeConfigInstruction,
    harvestWithheldTokensToMint,
    transferCheckedWithFee,
    withdrawWithheldTokensFromAccounts,
    withdrawWithheldTokensFromMint,
} from '@solana/spl-token';
import dotenv from "dotenv";
dotenv.config();

async function main() {
    //sostituire con wallet propietario
    // Generate keys for payer, mint authority, and mint
    console.log('key: ', process.env.PRIVATE_KEY);
    // const privateKeyBytes = Buffer.from(process.env.PRIVATE_KEY, "hex");
    const payer = Keypair.fromSecretKey(base58.decode(process.env.PRIVATE_KEY));


    const mintAuthority = Keypair.generate();
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    const transferFeeConfigAuthority = Keypair.generate();
    const withdrawWithheldAuthority = Keypair.generate();

    const extensions = [ExtensionType.TransferFeeConfig];

    const mintLen = getMintLen(extensions);
    const decimals = 9;
    const feeBasisPoints = 100; // 1%
    const maxFee = BigInt(9 * Math.pow(10, decimals)); // 9 tokens
    

    // Initialize connection to local Solana node
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature: airdropSignature, ...(await connection.getLatestBlockhash()) });

    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    const mintTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mint,
            space: mintLen,
            lamports: mintLamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeTransferFeeConfigInstruction(
            mint,
            transferFeeConfigAuthority.publicKey,
            withdrawWithheldAuthority.publicKey,
            feeBasisPoints,
            maxFee,
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(mint, decimals, mintAuthority.publicKey, null, TOKEN_2022_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair], undefined);
};

// Execute the main function
main();
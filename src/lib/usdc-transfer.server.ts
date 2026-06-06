// Server-only module — NEVER import this from client code.
// Uses Circle Developer-Controlled Wallets SDK to send USDC on Arc Testnet.
// The bot wallet is created once via bot/setup-wallet.ts and its ID is stored in BOT_WALLET_ID.

import process from "node:process";
import { randomUUID } from "node:crypto";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

// Arc Testnet USDC ERC-20 contract address (6 decimals)
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";

// Blockchain identifier for Arc Testnet in the Circle API
const ARC_TESTNET_BLOCKCHAIN = "ARC-TESTNET" as const;

// Poll interval & max attempts for transaction confirmation
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 40; // 40 × 3s = 2 minutes max

function getCircleClient() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET is not configured");
  }

  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

function getBotWalletId(): string {
  const walletId = process.env.BOT_WALLET_ID;
  if (!walletId) {
    throw new Error(
      "BOT_WALLET_ID is not configured. Run `node bot/setup-wallet.js` to create the bot wallet first.",
    );
  }
  return walletId;
}

/**
 * Send USDC from the bot's Circle Developer-Controlled Wallet to a recipient address.
 *
 * @param toAddress  Recipient's Arc Testnet wallet address (0x...)
 * @param amountUsdc Amount of USDC to send (human-readable, e.g. 5 for 5 USDC)
 * @returns          { txHash, walletId } on success
 */
export async function sendUsdc(
  toAddress: string,
  amountUsdc: number,
): Promise<{ txHash: string; walletId: string }> {
  if (!toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error(`Invalid recipient address: ${toAddress}`);
  }
  if (amountUsdc <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const client = getCircleClient();
  const walletId = getBotWalletId();
  const idempotencyKey = randomUUID();

  // Initiate the transfer
  const transferResponse = await client.createTransaction({
    walletId,
    tokenAddress: ARC_TESTNET_USDC,
    destinationAddress: toAddress as `0x${string}`,
    amount: [amountUsdc.toFixed(6)],
    fee: {
      type: "level",
      config: { feeLevel: "MEDIUM" },
    },
    idempotencyKey,
  });

  const transactionId = transferResponse.data?.id;
  if (!transactionId) {
    throw new Error("Circle API did not return a transaction ID");
  }

  console.log(`[usdc-transfer] Transaction initiated: ${transactionId}`);

  // Poll until terminal state
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const txResponse = await client.getTransaction({ id: transactionId });
    const tx = txResponse.data?.transaction;
    const state = tx?.state;

    console.log(`[usdc-transfer] Poll ${attempt + 1}/${MAX_POLL_ATTEMPTS}: state=${state}`);

    if (state === "COMPLETE") {
      const txHash = tx?.txHash;
      if (!txHash) throw new Error("Transaction complete but txHash is missing");
      return { txHash, walletId };
    }

    if (state === "FAILED" || state === "DENIED" || state === "CANCELLED") {
      throw new Error(`Transaction ${state.toLowerCase()}: id=${transactionId}`);
    }
    // INITIATED, WAITING, CLEARED, QUEUED, SENT, CONFIRMED, STUCK — keep polling
  }

  throw new Error(
    `Transaction ${transactionId} did not reach COMPLETE within ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`,
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

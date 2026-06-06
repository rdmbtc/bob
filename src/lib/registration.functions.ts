import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { registrationSchema } from "./registration.schema";

// Get the current user's registration (or null).
export const getMyRegistration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("registrations")
      .select("id, twitter_handle, wallet_address, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { registration: data };
  });

// Create or update the current user's registration.
export const saveMyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registrationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Ensure the handle isn't claimed by a different user.
    const { data: existing, error: lookupError } = await supabase
      .from("registrations")
      .select("user_id")
      .eq("twitter_handle", data.twitter_handle)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);
    if (existing && existing.user_id !== userId) {
      throw new Error("That Twitter handle is already registered by someone else.");
    }

    // We only generate a new wallet if they don't already have one in the database.
    let walletAddress = userReg?.wallet_address;

    if (!walletAddress) {
      // Generate a new Developer-Controlled Wallet for this user
      const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");
      const apiKey = process.env.CIRCLE_API_KEY;
      const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
      const botWalletId = process.env.BOT_WALLET_ID;
      
      if (!apiKey || !entitySecret || !botWalletId) {
        throw new Error("Server missing Circle environment variables for wallet generation.");
      }

      const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
      
      const botWalletRes = await client.getWallet({ id: botWalletId });
      const walletSetId = botWalletRes.data?.wallet?.walletSetId;

      if (!walletSetId) {
        throw new Error("Failed to retrieve walletSetId from bot wallet.");
      }
      
      const newWalletRes = await client.createWallets({
        idempotencyKey: crypto.randomUUID(),
        blockchains: ["ARC-TESTNET"],
        count: 1,
        walletSetId,
        accountType: "EOA",
        metadata: [{ name: `user-${userId}`, refId: userId }],
      });

      walletAddress = newWalletRes.data?.wallets?.[0]?.address;
      if (!walletAddress) {
        throw new Error("Failed to generate wallet from Circle API.");
      }
    }

    const { data: saved, error } = await supabase
      .from("registrations")
      .upsert(
        {
          user_id: userId,
          twitter_handle: data.twitter_handle,
          wallet_address: walletAddress,
        },
        { onConflict: "user_id" },
      )
      .select("id, twitter_handle, wallet_address, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);
    return { registration: saved };
  });

// Force regenerate wallet
export const regenerateMyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Generate a new Developer-Controlled Wallet for this user
    const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");
    const apiKey = process.env.CIRCLE_API_KEY;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
    const botWalletId = process.env.BOT_WALLET_ID;
    
    if (!apiKey || !entitySecret || !botWalletId) {
      throw new Error("Server missing Circle environment variables for wallet generation.");
    }

    const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
    
    const botWalletRes = await client.getWallet({ id: botWalletId });
    const walletSetId = botWalletRes.data?.wallet?.walletSetId;

    if (!walletSetId) {
      throw new Error("Failed to retrieve walletSetId from bot wallet.");
    }
    
    const newWalletRes = await client.createWallets({
      idempotencyKey: crypto.randomUUID(),
      blockchains: ["ARC-TESTNET"],
      count: 1,
      walletSetId,
      accountType: "EOA",
      metadata: [{ name: `user-${userId}-regen`, refId: userId }],
    });

    const newWalletAddress = newWalletRes.data?.wallets?.[0]?.address;
    if (!newWalletAddress) {
      throw new Error("Failed to generate wallet from Circle API.");
    }

    const { data: saved, error } = await supabase
      .from("registrations")
      .update({ wallet_address: newWalletAddress })
      .eq("user_id", userId)
      .select("id, twitter_handle, wallet_address, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);
    return { registration: saved };
  });

// List transactions sent to the current user's registered handle.
export const getMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("transactions")
      .select("id, twitter_handle, amount_usdc, tx_hash, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return { transactions: data ?? [] };
  });

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

    const { data: saved, error } = await supabase
      .from("registrations")
      .upsert(
        {
          user_id: userId,
          twitter_handle: data.twitter_handle,
          wallet_address: data.wallet_address,
        },
        { onConflict: "user_id" },
      )
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

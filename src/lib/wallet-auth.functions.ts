import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { WALLET_REGEX } from "./config";

// Build the human-readable message the user signs in their wallet.
function buildSignInMessage(address: string, nonce: string): string {
  return [
    "Sign in to BobArcPay",
    "",
    "By signing this message you authenticate ownership of this wallet.",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

const addressSchema = z
  .string()
  .trim()
  .regex(WALLET_REGEX, "Invalid wallet address.")
  .transform((v) => v.toLowerCase());

// Step 1: issue a one-time nonce for the given wallet address.
export const requestWalletNonce = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ address: addressSchema }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const nonce = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("wallet_nonces")
      .upsert(
        { address: data.address, nonce, expires_at: expiresAt },
        { onConflict: "address" },
      );

    if (error) throw new Error("Could not start sign-in. Please try again.");

    return { message: buildSignInMessage(data.address, nonce), nonce };
  });

// Step 2: verify the signature and return a one-time token to create a session.
export const verifyWalletSignature = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        address: addressSchema,
        signature: z.string().trim().min(1).max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyMessage } = await import("viem");

    // Load and consume the nonce.
    const { data: row, error: nonceError } = await supabaseAdmin
      .from("wallet_nonces")
      .select("nonce, expires_at")
      .eq("address", data.address)
      .maybeSingle();

    if (nonceError || !row) throw new Error("Sign-in expired. Please try again.");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("wallet_nonces").delete().eq("address", data.address);
      throw new Error("Sign-in expired. Please try again.");
    }

    const message = buildSignInMessage(data.address, row.nonce);
    const valid = await verifyMessage({
      address: data.address as `0x${string}`,
      message,
      signature: data.signature as `0x${string}`,
    });
    if (!valid) throw new Error("Signature verification failed.");

    // Consume the nonce so it cannot be replayed.
    await supabaseAdmin.from("wallet_nonces").delete().eq("address", data.address);

    // Map the wallet to a confirmed auth user via a synthetic email.
    const email = `${data.address}@arcwallet.bobarcpay.app`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !linkData?.properties?.hashed_token || !linkData.user) {
      throw new Error("Could not create your session. Please try again.");
    }

    // Ensure the user is confirmed and stores its wallet address.
    await supabaseAdmin.auth.admin.updateUserById(linkData.user.id, {
      email_confirm: true,
      user_metadata: { wallet_address: data.address },
    });

    return { tokenHash: linkData.properties.hashed_token, email };
  });

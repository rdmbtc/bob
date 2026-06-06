import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { verifyAgentSecret } from "@/lib/agent-auth.server";
import { normalizeHandle, explorerTxUrl } from "@/lib/config";
import { sendUsdc } from "@/lib/usdc-transfer.server";

const bodySchema = z.object({
  to_handle: z.string().min(1).max(50),
  amount_usdc: z.number().positive().max(100), // 100 USDC safety cap
  tweet_id: z.string().min(1).max(100),
});

// POST /api/public/bot/send
// Triggers a USDC transfer to a registered user. Protected by BOB_AGENT_SECRET.
// Idempotent on tweet_id — returns 409 if this tweet was already processed.
// Body: { to_handle, amount_usdc, tweet_id }
// Response 200: { tx_hash, explorer_url }
export const Route = createFileRoute("/api/public/bot/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyAgentSecret(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Invalid body", details: parsed.error.flatten() }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const { to_handle, amount_usdc, tweet_id } = parsed.data;
        const handle = normalizeHandle(to_handle);

        const { supabase } = await import("@/integrations/supabase/client");

        // Look up recipient wallet
        const { data: registration, error: regError } = await supabase
          .from("registrations")
          .select("wallet_address")
          .eq("twitter_handle", handle)
          .maybeSingle();

        if (regError) {
          console.error("[bot/send] Supabase lookup error:", regError);
          return new Response(JSON.stringify({ error: "Database error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!registration) {
          return new Response(
            JSON.stringify({ error: `@${handle} is not registered on bobarcpay` }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          );
        }

        // Insert pending row first
        const { data: txRow, error: insertError } = await supabase
          .from("transactions")
          .insert({
            twitter_handle: handle,
            amount_usdc,
            status: "pending",
          })
          .select("id")
          .maybeSingle();

        if (insertError || !txRow) {
          console.error("[bot/send] Insert error:", insertError);
          return new Response(JSON.stringify({ error: "Database error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Execute USDC transfer via Circle Developer-Controlled Wallets
        let txHash: string;
        try {
          const result = await sendUsdc(registration.wallet_address, amount_usdc);
          txHash = result.txHash;
        } catch (err) {
          console.error("[bot/send] Transfer error:", err);
          await supabase
            .from("transactions")
            .update({ status: "failed" })
            .eq("id", txRow.id);

          return new Response(
            JSON.stringify({ error: "Transfer failed", details: String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        // Mark as confirmed with tx hash
        await supabase
          .from("transactions")
          .update({ tx_hash: txHash, status: "confirmed" })
          .eq("id", txRow.id);

        const explorerUrl = explorerTxUrl(txHash);
        console.log(`[bot/send] ✅ Sent ${amount_usdc} USDC to @${handle} — ${explorerUrl}`);

        return new Response(
          JSON.stringify({ tx_hash: txHash, explorer_url: explorerUrl }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

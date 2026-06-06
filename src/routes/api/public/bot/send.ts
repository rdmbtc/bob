import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { verifyAgentSecret } from "@/lib/agent-auth.server";
import { normalizeHandle, explorerTxUrl } from "@/lib/config";
import { sendUsdc } from "@/lib/usdc-transfer.server";

const bodySchema = z.object({
  from_handle: z.string().min(1).max(50),
  to_handle: z.string().min(1).max(50),
  amount_usdc: z.number().positive().max(100),
  tweet_id: z.string().min(1).max(100),
});

export const Route = createFileRoute("/api/public/bot/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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

          const { from_handle, to_handle, amount_usdc, tweet_id } = parsed.data;
          const sender = normalizeHandle(from_handle);
          const recipient = normalizeHandle(to_handle);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Look up sender wallet + circle_wallet_id
          const { data: senderReg, error: senderError } = await supabaseAdmin
            .from("registrations")
            .select("wallet_address, circle_wallet_id")
            .eq("twitter_handle", sender)
            .maybeSingle();

          if (senderError) {
            console.error("[bot/send] Sender lookup error:", senderError);
            return new Response(JSON.stringify({ error: "Database error", details: senderError.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!senderReg) {
            return new Response(
              JSON.stringify({ error: `@${sender} (sender) is not registered on bobarcpay` }),
              { status: 422, headers: { "Content-Type": "application/json" } },
            );
          }

          // 2. Look up recipient wallet
          const { data: recipientReg, error: recipientError } = await supabaseAdmin
            .from("registrations")
            .select("wallet_address")
            .eq("twitter_handle", recipient)
            .maybeSingle();

          if (recipientError) {
            console.error("[bot/send] Recipient lookup error:", recipientError);
            return new Response(JSON.stringify({ error: "Database error", details: recipientError.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!recipientReg) {
            return new Response(
              JSON.stringify({ error: `@${recipient} (recipient) is not registered on bobarcpay` }),
              { status: 422, headers: { "Content-Type": "application/json" } },
            );
          }

          // 3. Resolve sender's Circle Wallet ID
          let fromWalletId: string | undefined;

          // Prefer stored circle_wallet_id from registration
          if ((senderReg as any).circle_wallet_id) {
            fromWalletId = (senderReg as any).circle_wallet_id;
          } else {
            // Fallback: resolve via Circle API listWallets
            try {
              const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");
              const apiKey = process.env.CIRCLE_API_KEY;
              const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
              
              if (!apiKey || !entitySecret) {
                throw new Error("Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET env vars");
              }

              const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
              const walletsRes = await client.listWallets({ address: senderReg.wallet_address });
              const resolvedId = walletsRes.data?.wallets?.[0]?.id;
              
              if (!resolvedId) {
                throw new Error(`No Circle wallet found for address ${senderReg.wallet_address}`);
              }
              fromWalletId = resolvedId;

              // Cache it for next time
              await supabaseAdmin
                .from("registrations")
                .update({ circle_wallet_id: resolvedId })
                .eq("wallet_address", senderReg.wallet_address);

            } catch (resolveErr) {
              console.error("[bot/send] Error resolving wallet ID:", resolveErr);
              return new Response(
                JSON.stringify({ error: "Failed to resolve sender's Circle wallet", details: String(resolveErr) }),
                { status: 500, headers: { "Content-Type": "application/json" } },
              );
            }
          }

          // Insert pending row
          const { data: txRow, error: insertError } = await supabaseAdmin
            .from("transactions")
            .insert({
              twitter_handle: recipient,
              amount_usdc,
              status: "pending",
            })
            .select("id")
            .maybeSingle();

          if (insertError || !txRow) {
            console.error("[bot/send] Insert error:", insertError);
            return new Response(JSON.stringify({ error: "Database error", details: insertError?.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Execute USDC transfer
          let txHash: string;
          try {
            const result = await sendUsdc(recipientReg.wallet_address, amount_usdc, fromWalletId);
            txHash = result.txHash;
          } catch (err) {
            console.error("[bot/send] Transfer error:", err);
            await supabaseAdmin
              .from("transactions")
              .update({ status: "failed" })
              .eq("id", txRow.id);

            return new Response(
              JSON.stringify({ error: "Transfer failed", details: String(err) }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          // Mark as confirmed
          await supabaseAdmin
            .from("transactions")
            .update({ tx_hash: txHash, status: "confirmed" })
            .eq("id", txRow.id);

          const explorerUrl = explorerTxUrl(txHash);
          console.log(`[bot/send] ✅ Sent ${amount_usdc} USDC from @${sender} to @${recipient} — ${explorerUrl}`);

          return new Response(
            JSON.stringify({ tx_hash: txHash, explorer_url: explorerUrl }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (outerErr) {
          console.error("[bot/send] Unhandled error:", outerErr);
          return new Response(
            JSON.stringify({ error: "Internal server error", details: String(outerErr) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

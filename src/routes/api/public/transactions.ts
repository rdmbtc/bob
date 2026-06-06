import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { verifyAgentSecret } from "@/lib/agent-auth.server";
import { normalizeHandle } from "@/lib/config";

const bodySchema = z.object({
  twitter_handle: z.string().min(1).max(50),
  amount_usdc: z.number().positive().max(1_000_000),
  tx_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid tx hash")
    .optional(),
  status: z.enum(["pending", "confirmed", "failed"]).optional(),
});

// POST /api/public/transactions
// Logs a USDC send made by the bot. Protected by BOB_AGENT_SECRET.
export const Route = createFileRoute("/api/public/transactions")({
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
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("transactions")
          .insert({
            twitter_handle: normalizeHandle(parsed.data.twitter_handle),
            amount_usdc: parsed.data.amount_usdc,
            tx_hash: parsed.data.tx_hash ?? null,
            status: parsed.data.status ?? "pending",
          })
          .select("id, twitter_handle, amount_usdc, tx_hash, status, created_at")
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: "Insert failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ transaction: data }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { verifyAgentSecret } from "@/lib/agent-auth.server";
import { normalizeHandle } from "@/lib/config";

const querySchema = z.object({
  handle: z.string().min(1).max(50),
});

// GET /api/public/bot/lookup?handle=<twitter_handle>
// Returns the registered Arc wallet for a Twitter handle. Protected by BOB_AGENT_SECRET.
// Response: { registered: true, wallet_address: "0x..." } | { registered: false }
export const Route = createFileRoute("/api/public/bot/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!verifyAgentSecret(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const parsed = querySchema.safeParse({ handle: url.searchParams.get("handle") });

        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Missing or invalid handle param" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const handle = normalizeHandle(parsed.data.handle);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("registrations")
          .select("wallet_address")
          .eq("twitter_handle", handle)
          .maybeSingle();

        if (error) {
          console.error("[bot/lookup] Supabase error:", error);
          return new Response(JSON.stringify({ error: "Database error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!data) {
          return new Response(JSON.stringify({ registered: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ registered: true, wallet_address: data.wallet_address }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

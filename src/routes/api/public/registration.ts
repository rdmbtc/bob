import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { verifyAgentSecret } from "@/lib/agent-auth.server";
import { normalizeHandle } from "@/lib/config";

const querySchema = z.object({
  handle: z.string().min(1).max(50),
});

// GET /api/public/registration?handle=<twitter>
// Returns the registered Arc wallet for a handle. Protected by BOB_AGENT_SECRET.
export const Route = createFileRoute("/api/public/registration")({
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
          return new Response(JSON.stringify({ error: "Invalid handle" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const handle = normalizeHandle(parsed.data.handle);
        const { supabase } = await import("@/integrations/supabase/client");

        const { data, error } = await supabase
          .from("registrations")
          .select("twitter_handle, wallet_address")
          .eq("twitter_handle", handle)
          .maybeSingle();

        if (error) {
          return new Response(JSON.stringify({ error: "Lookup failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!data) {
          return new Response(JSON.stringify({ error: "Not registered" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            twitter_handle: data.twitter_handle,
            wallet_address: data.wallet_address,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

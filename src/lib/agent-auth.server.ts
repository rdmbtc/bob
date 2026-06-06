import { timingSafeEqual } from "crypto";

// Returns true if the request carries the correct agent bearer secret.
export function verifyAgentSecret(request: Request): boolean {
  const secret = process.env.BOB_AGENT_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;

  const provided = authHeader.slice("Bearer ".length);
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

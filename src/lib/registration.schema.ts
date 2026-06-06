import { z } from "zod";

import { normalizeHandle, WALLET_REGEX } from "./config";

// Client-safe schema reused by the dashboard form and the server fn.
export const registrationSchema = z.object({
  twitter_handle: z
    .string()
    .trim()
    .min(1, "Twitter handle is required")
    .max(50, "Handle is too long")
    .transform(normalizeHandle)
    .refine((v) => /^[a-z0-9_]{1,15}$/.test(v), {
      message: "Use a valid Twitter handle (letters, numbers, underscore)",
    }),
  wallet_address: z
    .string()
    .trim()
    .regex(WALLET_REGEX, "Enter a valid Arc wallet address (0x...)")
    .optional()
    .or(z.literal("")),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

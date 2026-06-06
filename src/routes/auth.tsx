import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Wallet } from "lucide-react";

import bobAvatar from "@/assets/bob-avatar.png";
import { Clouds } from "@/components/Clouds";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import {
  getDefaultProvider,
  requestAccount,
  ensureArcTestnet,
  personalSign,
} from "@/lib/wallet";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BobArcPay" },
      { name: "description", content: "Connect your wallet to sign in to BobArcPay." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<"wallet" | "google" | null>(null);

  async function handleWallet() {
    setLoading("wallet");
    try {
      const provider = getDefaultProvider();
      if (!provider) {
        toast.error("No wallet detected. Install a browser wallet like MetaMask.");
        return;
      }

      const address = await requestAccount(provider);
      try {
        await ensureArcTestnet(provider);
      } catch (networkErr) {
        console.warn("Could not switch to Arc Testnet, proceeding anyway:", networkErr);
      }

      // Generate a static, deterministic message for signing
      const message = [
        "Sign in to BobArcPay",
        "",
        "By signing this message you authenticate ownership of this wallet.",
        "",
        `Wallet: ${address.toLowerCase()}`,
      ].join("\n");

      const signature = await personalSign(provider, address, message);

      // Hash the signature using SHA-256 to fit within Supabase's 72-character password limit (SHA-256 hex is 64 chars)
      const msgUint8 = new TextEncoder().encode(signature);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const password = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const email = `${address.toLowerCase()}@arcwallet.bobarcpay.app`;

      // Step 1: Try to sign in with password
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Step 2: If sign in fails because user doesn't exist, sign up
        if (signInError.message.includes("Invalid login credentials") || signInError.message.includes("User not found")) {
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                wallet_address: address.toLowerCase(),
              },
            },
          });
          if (signUpError) {
            console.error("signUp error:", signUpError);
            toast.error("Could not complete registration. Please try again.");
            return;
          }
        } else {
          console.error("signIn error:", signInError);
          toast.error("Wallet sign-in failed. Please try again.");
          return;
        }
      }

      toast.success("Wallet connected — you're signed in!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      console.error("Wallet auth error:", err);
      const code = (err as { code?: number })?.code;
      if (code === 4001) {
        toast.error("Request rejected in your wallet.");
      } else {
        toast.error("Wallet sign-in failed. Please try again.");
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleGoogle() {
    setLoading("google");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) {
      setLoading(null);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-hero px-4 py-12">
      <Clouds />
      <Link to="/" className="relative z-10 mb-6 flex items-center gap-2">
        <img
          src={bobAvatar}
          alt="BobArcPay"
          width={48}
          height={48}
          className="h-12 w-12 animate-bob rounded-full border-[3px] border-foreground bg-secondary"
        />
        <span className="font-display text-2xl tracking-wide text-foreground drop-shadow-[2px_2px_0_white]">
          BobArcPay
        </span>
      </Link>

      <div className="relative z-10 w-full max-w-sm rounded-3xl border-[3px] border-foreground bg-card p-6 shadow-bob-lg">
        <h1 className="text-center font-display text-2xl tracking-wide">Sign in to BobArcPay</h1>
        <p className="mt-1 text-center text-sm font-medium text-muted-foreground">
          Connect your Arc wallet to get started.
        </p>

        <Button className="mt-6 w-full" onClick={handleWallet} disabled={loading !== null}>
          <Wallet className="mr-2 h-4 w-4" />
          {loading === "wallet" ? "Connecting…" : "Connect Wallet"}
        </Button>

        <div className="my-4 flex items-center gap-3 text-xs font-bold text-muted-foreground">
          <span className="h-0.5 flex-1 bg-foreground/30" />
          OR
          <span className="h-0.5 flex-1 bg-foreground/30" />
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading !== null}
        >
          {loading === "google" ? "Please wait…" : "Continue with Google"}
        </Button>

        <p className="mt-4 text-center text-xs font-medium text-muted-foreground">
          Signing the message is free and proves you own the wallet. It never moves funds.
        </p>
      </div>
    </div>
  );
}

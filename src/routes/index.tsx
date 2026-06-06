import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Wallet, Twitter, Send } from "lucide-react";

import bobHero from "@/assets/bob-hero.png";
import { Clouds } from "@/components/Clouds";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { BOT_HANDLE } from "@/lib/config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BobArcPay — Send USDC with a tweet" },
      {
        name: "description",
        content:
          "Link your Twitter handle to an Arc wallet and let Bob send testnet USDC when you reply @bobarcpay send 20 usdc.",
      },
      { property: "og:title", content: "BobArcPay — Send USDC with a tweet" },
      {
        property: "og:description",
        content: "Bob, your finance agent on Arc. Send testnet USDC straight from a tweet.",
      },
    ],
  }),
  component: Index,
});

const steps = [
  {
    icon: Twitter,
    title: "Link your Twitter",
    body: "Sign up and connect the Twitter handle you tweet from.",
    color: "bg-secondary",
  },
  {
    icon: Wallet,
    title: "Add your Arc wallet",
    body: "Connect your Arc testnet wallet so funds can be tracked.",
    color: "bg-accent",
  },
  {
    icon: Send,
    title: "Tweet to send",
    body: `Reply @${BOT_HANDLE} send 20 usdc and Bob handles the transfer.`,
    color: "bg-primary text-primary-foreground",
  },
] as const;

function Index() {
  return (
    <PageShell>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <Clouds />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="animate-pop">
            <span className="inline-flex rotate-[-2deg] items-center gap-2 rounded-full border-[3px] border-foreground bg-secondary px-4 py-1.5 text-sm font-bold text-secondary-foreground shadow-bob">
              D'oh! Powered by Arc testnet
            </span>
            <h1 className="mt-5 font-display text-5xl leading-[1.05] text-foreground drop-shadow-[3px_3px_0_white] sm:text-6xl">
              Send USDC with{" "}
              <span className="text-primary">just a tweet.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg font-medium text-foreground/80">
              Meet Bob, your finance agent. Reply to any post with{" "}
              <code className="rounded-md border-2 border-foreground bg-card px-1.5 py-0.5 font-mono text-sm font-bold">
                @{BOT_HANDLE} send 20 usdc
              </code>{" "}
              and Bob sends it for you — then replies with the explorer link.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Register your handle <ArrowRight className="ml-1 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative animate-float">
              <span className="absolute -left-4 -top-4 z-10 rotate-[-8deg] rounded-2xl border-[3px] border-foreground bg-card px-3 py-1 font-display text-lg text-primary shadow-bob">
                Hi, I'm Bob!
              </span>
              <img
                src={bobHero}
                alt="Bob, your finance agent on Arc"
                width={1024}
                height={1024}
                className="w-full max-w-md rounded-[2rem] border-4 border-foreground shadow-bob-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Demo strip */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <div className="rotate-[-1deg] rounded-3xl border-[3px] border-foreground bg-card p-6 shadow-bob-lg">
          <p className="font-display text-xl text-muted-foreground">On Twitter</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border-2 border-foreground bg-secondary/60 px-4 py-3 font-medium">
              <span className="font-bold">@you</span>{" "}
              <span className="text-foreground">@{BOT_HANDLE} send 20 usdc to @alice</span>
            </div>
            <div className="rounded-2xl border-2 border-foreground bg-primary/15 px-4 py-3 font-medium">
              <span className="font-bold text-primary">@{BOT_HANDLE}</span>{" "}
              <span className="text-foreground">Done! Sent 20 USDC ✅ View on Arc explorer →</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <h2 className="text-center font-display text-4xl text-foreground">
          Three steps to get started
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="group rounded-3xl border-[3px] border-foreground bg-card p-6 shadow-bob transition-transform hover:-translate-y-1.5 hover:rotate-1"
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] border-foreground ${s.color} shadow-bob transition-transform group-hover:animate-wiggle`}
              >
                <s.icon className="h-7 w-7" />
              </div>
              <h3 className="mt-5 font-display text-2xl">
                <span className="text-primary">{i + 1}.</span> {s.title}
              </h3>
              <p className="mt-2 font-medium text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Button asChild size="lg">
            <Link to="/auth">
              Get started free <ArrowRight className="ml-1 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}

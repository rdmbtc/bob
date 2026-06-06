import { createFileRoute, Link } from "@tanstack/react-router";

import { Clouds } from "@/components/Clouds";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { BOT_HANDLE } from "@/lib/config";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — BobArcPay" },
      {
        name: "description",
        content:
          "How BobArcPay sends Arc testnet USDC from a tweet: register your handle and wallet, then reply to Bob.",
      },
      { property: "og:title", content: "How it works — BobArcPay" },
      {
        property: "og:description",
        content: "Register your Twitter handle and Arc wallet, then tweet to send USDC.",
      },
    ],
  }),
  component: HowItWorks,
});

const steps = [
  {
    title: "Register",
    body: "Create an account, then link the Twitter handle you post from and your Arc testnet wallet address. Each handle can only be claimed once.",
  },
  {
    title: "Tweet a command",
    body: `Reply to any tweet (or post) with a command like “@${BOT_HANDLE} send 20 usdc”. Bob watches mentions for this pattern.`,
  },
  {
    title: "Bob verifies",
    body: "Bob looks up your registered handle to confirm you're a known sender, then prepares the USDC transfer on Arc testnet.",
  },
  {
    title: "Bob sends & replies",
    body: "Bob's agent wallet sends the testnet USDC and replies to your tweet with a link to the transaction on the Arc explorer. It also appears in your dashboard.",
  },
];

function HowItWorks() {
  return (
    <PageShell>
      <section className="relative overflow-hidden bg-gradient-hero">
        <Clouds />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="font-display text-5xl text-foreground drop-shadow-[3px_3px_0_white]">
            How BobArcPay works
          </h1>
          <p className="mt-4 text-lg font-medium text-foreground/80">
            Move <strong>Arc testnet USDC</strong> with a single tweet. No app to install — just
            a tweet to Bob.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <ol className="space-y-6">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="flex gap-4 rounded-3xl border-[3px] border-foreground bg-card p-6 shadow-bob transition-transform hover:-translate-y-1 hover:rotate-1"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[3px] border-foreground bg-secondary font-display text-xl text-secondary-foreground shadow-bob">
                {i + 1}
              </div>
              <div>
                <h2 className="font-display text-2xl">{s.title}</h2>
                <p className="mt-1 font-medium text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rotate-[-1deg] rounded-3xl border-[3px] border-foreground bg-secondary/60 p-6 shadow-bob">
          <h3 className="font-display text-xl">A note on custody</h3>
          <p className="mt-2 font-medium text-foreground/80">
            For this MVP, Bob's central agent wallet holds the testnet USDC and sends on your
            behalf. This is testnet money only — never send real funds.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link to="/auth">Register your handle</Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { Clouds } from "@/components/Clouds";
import { PageShell } from "@/components/PageShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BOT_HANDLE } from "@/lib/config";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — BobArcPay" },
      {
        name: "description",
        content:
          "Frequently asked questions about BobArcPay: how sending works, custody, Arc testnet, and registration.",
      },
      { property: "og:title", content: "FAQ — BobArcPay" },
      {
        property: "og:description",
        content: "Answers about sending USDC with a tweet on Arc testnet.",
      },
    ],
  }),
  component: Faq,
});

const faqs = [
  {
    q: "Is this real money?",
    a: "No. BobArcPay runs on Arc testnet and moves testnet USDC only. It's for trying things out, not real value.",
  },
  {
    q: "Do I need a special wallet?",
    a: "You need an Arc testnet wallet address (starts with 0x). You register it here so transactions can be tracked.",
  },
  {
    q: "Whose wallet sends the USDC?",
    a: "Bob's central agent wallet sends on your behalf in this MVP. You just register your Twitter handle and your Arc wallet.",
  },
  {
    q: "How does Bob read my tweet without the paid X API?",
    a: `Bob's server watches for mentions of @${BOT_HANDLE} using a free third-party service, then matches commands like “send 20 usdc”.`,
  },
  {
    q: "How do I send?",
    a: `Reply to a tweet with “@${BOT_HANDLE} send <amount> usdc”. Once registered, Bob will process it and reply with the explorer link.`,
  },
  {
    q: "Where can I see my transactions?",
    a: "Your dashboard lists transactions tied to your registered handle, each with a link to the Arc explorer.",
  },
];

function Faq() {
  return (
    <PageShell>
      <section className="relative overflow-hidden bg-gradient-hero">
        <Clouds />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="font-display text-5xl text-foreground drop-shadow-[3px_3px_0_white]">
            Frequently asked questions
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`item-${i}`}
              className="rounded-2xl border-[3px] border-foreground bg-card px-5 shadow-bob"
            >
              <AccordionTrigger className="text-left font-display text-lg tracking-wide hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="font-medium text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PageShell>
  );
}

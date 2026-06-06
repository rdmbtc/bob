import { Link } from "@tanstack/react-router";

import { BOT_HANDLE } from "@/lib/config";

export function Footer() {
  return (
    <footer className="border-t-[3px] border-foreground bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row">
        <p className="font-semibold">
          BobArcPay — your finance agent on{" "}
          <span className="font-display tracking-wide text-secondary">Arc testnet</span>.
        </p>
        <div className="flex items-center gap-5 font-bold">
          <Link to="/how-it-works" className="transition-transform hover:-translate-y-0.5 hover:text-secondary">
            How it works
          </Link>
          <Link to="/faq" className="transition-transform hover:-translate-y-0.5 hover:text-secondary">
            FAQ
          </Link>
          <a
            href={`https://twitter.com/${BOT_HANDLE}`}
            target="_blank"
            rel="noreferrer"
            className="transition-transform hover:-translate-y-0.5 hover:text-secondary"
          >
            @{BOT_HANDLE}
          </a>
        </div>
      </div>
    </footer>
  );
}

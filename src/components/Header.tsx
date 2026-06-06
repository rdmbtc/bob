import { Link } from "@tanstack/react-router";

import bobAvatar from "@/assets/bob-avatar.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/faq", label: "FAQ" },
] as const;

export function Header() {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-foreground bg-secondary">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="group flex items-center gap-2">
          <img
            src={bobAvatar}
            alt="BobArcPay logo"
            width={40}
            height={40}
            className="h-10 w-10 rounded-full border-[3px] border-foreground bg-secondary transition-transform group-hover:animate-wiggle"
          />
          <span className="font-display text-2xl tracking-wide text-foreground">
            BobArc<span className="text-primary">Pay</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-full border-2 border-transparent px-4 py-2 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-foreground hover:bg-card"
              activeProps={{ className: "border-foreground bg-card shadow-bob" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <Button asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link to="/auth">Log in</Link>
              </Button>
              <Button asChild>
                <Link to="/auth">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

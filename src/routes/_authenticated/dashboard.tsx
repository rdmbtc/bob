import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, LogOut, CheckCircle2 } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyRegistration,
  saveMyRegistration,
  getMyTransactions,
} from "@/lib/registration.functions";
import { registrationSchema } from "@/lib/registration.schema";
import { BOT_HANDLE, explorerTxUrl, normalizeHandle, WALLET_REGEX } from "@/lib/config";
import {
  getDefaultProvider,
  requestAccount,
  ensureArcTestnet,
} from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — BobArcPay" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [handle, setHandle] = useState("");
  const [wallet, setWallet] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [errors, setErrors] = useState<{ handle?: string; wallet?: string }>({});

  const fetchRegistration = useServerFn(getMyRegistration);
  const fetchTransactions = useServerFn(getMyTransactions);
  const saveRegistration = useServerFn(saveMyRegistration);

  const regQuery = useQuery({
    queryKey: ["registration"],
    queryFn: () => fetchRegistration(),
  });
  const txQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => fetchTransactions(),
  });

  const walletAddressToFetch = wallet && WALLET_REGEX.test(wallet) ? wallet : null;

  const balanceQuery = useQuery({
    queryKey: ["usdc-balance", walletAddressToFetch],
    queryFn: async () => {
      if (!walletAddressToFetch) return "0.00";
      try {
        const { createPublicClient, http, parseAbi, formatUnits } = await import("viem");
        
        const client = createPublicClient({
          transport: http("https://rpc.testnet.arc.network"),
        });
        
        const balance = await client.readContract({
          address: "0x3600000000000000000000000000000000000000",
          abi: parseAbi(["function balanceOf(address owner) view returns (uint256)"]),
          functionName: "balanceOf",
          args: [walletAddressToFetch as `0x${string}`],
        });
        
        return Number(formatUnits(balance, 6)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      } catch (err) {
        console.error("Failed to fetch balance:", err);
        return "0.00";
      }
    },
    enabled: !!walletAddressToFetch,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const reg = regQuery.data?.registration;
    if (reg) {
      setHandle(reg.twitter_handle);
      setWallet(reg.wallet_address);
      return;
    }
    // No registration yet: prefill the wallet from the signed-in wallet, if any.
    supabase.auth.getUser().then(({ data }) => {
      const addr = data.user?.user_metadata?.wallet_address as string | undefined;
      if (addr) setWallet((prev) => prev || addr);
    });
  }, [regQuery.data]);

  useEffect(() => {
    if (txQuery.data?.transactions) {
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
    }
  }, [txQuery.data?.transactions?.length, queryClient]);

  async function handleConnectWallet() {
    setConnecting(true);
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
        console.warn("Could not switch to Arc Testnet:", networkErr);
      }
      setWallet(address.toLowerCase());
      toast.success("Wallet connected.");
    } catch (err) {
      console.error("Connect wallet error:", err);
      toast.error("Could not connect wallet. Please try again.");
    } finally {
      setConnecting(false);
    }
  }


  const mutation = useMutation({
    mutationFn: (input: { twitter_handle: string; wallet_address?: string }) =>
      saveRegistration({ data: input }),
    onSuccess: () => {
      toast.success("Registration saved! Bob can now send on your behalf.");
      queryClient.invalidateQueries({ queryKey: ["registration"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registrationSchema.safeParse({
      twitter_handle: handle,
      wallet_address: wallet,
    });
    if (!parsed.success) {
      const fieldErrors: { handle?: string; wallet?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "twitter_handle") fieldErrors.handle = issue.message;
        if (issue.path[0] === "wallet_address") fieldErrors.wallet = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const registered = !!regQuery.data?.registration;
  const transactions = txQuery.data?.transactions ?? [];

  return (
    <PageShell>
      <section className="mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Your dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your handle and wallet, and track your sends.
            </p>
          </div>
          <Button variant="ghost" className="rounded-full" onClick={handleSignOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>

        {/* Balance & Status Overview */}
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Card className="border-[3px] border-foreground shadow-bob-sm bg-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Arc USDC Balance
              </CardDescription>
              <CardTitle className="text-2xl font-black font-display">
                {balanceQuery.isLoading ? (
                  <span className="inline-block h-8 w-24 animate-pulse rounded bg-foreground/10" />
                ) : (
                  <span>{balanceQuery.data ?? "0.00"} USDC</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Auto-syncing with Arc Testnet
              </p>
            </CardContent>
          </Card>

          <Card className="border-[3px] border-foreground shadow-bob-sm bg-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Registered Profile
              </CardDescription>
              <CardTitle className="text-2xl font-black font-display truncate">
                {handle ? `@${handle}` : "Not registered"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-xs text-muted-foreground">
                {registered ? "Verified on Twitter" : "Setup registration below"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-[3px] border-foreground shadow-bob-sm bg-card">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Transactions
              </CardDescription>
              <CardTitle className="text-2xl font-black font-display">
                {transactions.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-xs text-muted-foreground">
                Total transactions processed
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-5">
          {/* Registration */}
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Registration
                {registered && (
                  <Badge className="bg-secondary text-secondary-foreground">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Link the Twitter handle you post from and your Arc testnet wallet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="handle">Twitter handle</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">@</span>
                    <Input
                      id="handle"
                      value={handle}
                      onChange={(e) => setHandle(normalizeHandle(e.target.value))}
                      placeholder="yourhandle"
                    />
                  </div>
                  {errors.handle && (
                    <p className="text-sm text-destructive">{errors.handle}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="wallet">Arc wallet address</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full text-xs"
                      onClick={handleConnectWallet}
                      disabled={connecting}
                    >
                      {connecting ? "Connecting…" : "Connect wallet"}
                    </Button>
                  </div>
                  <Input
                    id="wallet"
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value.trim())}
                    placeholder="Leave blank to auto-generate a wallet"
                    className="font-mono"
                  />
                  {errors.wallet && (
                    <p className="text-sm text-destructive">{errors.wallet}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="rounded-full font-bold"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending
                    ? "Saving…"
                    : registered
                      ? "Update registration"
                      : "Save registration"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* How to send */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Ready to send</CardTitle>
              <CardDescription>Once registered, just tweet:</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-muted px-4 py-3 font-mono text-sm">
                @{BOT_HANDLE} send 20 usdc
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Bob will reply to your tweet with the Arc explorer link, and it'll show up below.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>Sends tied to your registered handle.</CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No transactions yet. Tweet a command to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Explorer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {new Date(tx.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {Number(tx.amount_usdc)} USDC
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.status === "confirmed" ? "default" : "secondary"}
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.tx_hash ? (
                          <a
                            href={explorerTxUrl(tx.tx_hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}

// Client-only browser wallet helpers (EIP-1193 + EIP-6963 discovery).
import { ARC_TESTNET } from "./config";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface Eip6963ProviderDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

// Collect injected wallets announced via EIP-6963, falling back to window.ethereum.
export function discoverProviders(): Eip6963ProviderDetail[] {
  if (typeof window === "undefined") return [];
  const found = new Map<string, Eip6963ProviderDetail>();

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (detail?.info?.uuid) found.set(detail.info.uuid, detail);
  };
  window.addEventListener("eip6963:announceProvider", handler as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  window.removeEventListener("eip6963:announceProvider", handler as EventListener);

  const list = Array.from(found.values());
  if (list.length === 0 && window.ethereum) {
    list.push({
      info: { uuid: "injected", name: "Browser Wallet", icon: "", rdns: "injected" },
      provider: window.ethereum,
    });
  }
  return list;
}

// Pick a provider: prefer the only one available, else the injected default.
export function getDefaultProvider(): Eip1193Provider | null {
  const list = discoverProviders();
  if (list.length === 1) return list[0].provider;
  if (typeof window !== "undefined" && window.ethereum) return window.ethereum;
  return list[0]?.provider ?? null;
}

export async function requestAccount(provider: Eip1193Provider): Promise<string> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) throw new Error("No accounts returned by wallet.");
  return accounts[0];
}

// Add/switch to Arc Testnet. Ignores rejection of switch but surfaces other errors.
export async function ensureArcTestnet(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET.chainIdHex }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    // 4902 = chain not added yet; add it.
    if (code === 4902 || code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_TESTNET.chainIdHex,
            chainName: ARC_TESTNET.chainName,
            rpcUrls: ARC_TESTNET.rpcUrls,
            blockExplorerUrls: ARC_TESTNET.blockExplorerUrls,
            nativeCurrency: ARC_TESTNET.nativeCurrency,
          },
        ],
      });
    } else if (code !== 4001) {
      throw err;
    }
  }
}

export async function personalSign(
  provider: Eip1193Provider,
  address: string,
  message: string,
): Promise<string> {
  return (await provider.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
}

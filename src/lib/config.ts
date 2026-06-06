// BobArcPay shared client-safe config.

// The Twitter/X handle of the Bob bot.
export const BOT_HANDLE = "bobarcpay";

// Arc testnet block explorer base URL used for transaction links.
export const ARC_EXPLORER_TX_BASE = "https://testnet.arcscan.app/tx/";

// Arc Testnet network parameters (for wallet_addEthereumChain).
export const ARC_TESTNET = {
  chainIdDecimal: 5042002,
  chainIdHex: "0x4cef52",
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
} as const;

export function explorerTxUrl(txHash: string): string {
  return `${ARC_EXPLORER_TX_BASE}${txHash}`;
}

// Normalize a Twitter handle: strip leading @, lowercase, trim.
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

export const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

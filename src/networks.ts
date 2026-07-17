/**
 * Injective EVM network metadata used by receipt_verify, wc_edge, and the
 * fund guide. Values are cross-checked against @injectivelabs/x402's own
 * networks module (imported below) so we never drift from the library.
 */
import {
  injectiveEvm,
  injectiveEvmTestnet,
  INJECTIVE_MAINNET_CAIP2,
  INJECTIVE_TESTNET_CAIP2,
  getRpcUrl,
  getToken,
  type InjectiveNetwork,
} from "@injectivelabs/x402/networks";

export {
  injectiveEvm,
  injectiveEvmTestnet,
  INJECTIVE_MAINNET_CAIP2,
  INJECTIVE_TESTNET_CAIP2,
  type InjectiveNetwork,
};

export interface NetworkMeta {
  caip2: InjectiveNetwork;
  chainId: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  /** Native USDC (Circle FiatTokenV2_2, EIP-3009) address on this network. */
  usdc: `0x${string}`;
}

function usdcFor(net: InjectiveNetwork): `0x${string}` {
  const t = getToken(net, "USDC");
  if (t) return t.address;
  // Hard fallbacks (match the x402 networks registry) in case getToken misses.
  return net === INJECTIVE_MAINNET_CAIP2
    ? "0xa00C59fF5a080D2b954d0c75e46E22a0c371235a"
    : "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";
}

export const NETWORKS: Record<InjectiveNetwork, NetworkMeta> = {
  [INJECTIVE_MAINNET_CAIP2]: {
    caip2: INJECTIVE_MAINNET_CAIP2,
    chainId: injectiveEvm.id,
    name: injectiveEvm.name,
    rpcUrl: getRpcUrl(INJECTIVE_MAINNET_CAIP2),
    explorer: injectiveEvm.blockExplorers.default.url,
    usdc: usdcFor(INJECTIVE_MAINNET_CAIP2),
  },
  [INJECTIVE_TESTNET_CAIP2]: {
    caip2: INJECTIVE_TESTNET_CAIP2,
    chainId: injectiveEvmTestnet.id,
    name: injectiveEvmTestnet.name,
    rpcUrl: getRpcUrl(INJECTIVE_TESTNET_CAIP2),
    explorer: injectiveEvmTestnet.blockExplorers.default.url,
    usdc: usdcFor(INJECTIVE_TESTNET_CAIP2),
  },
};

export function getNetworkMeta(caip2: string): NetworkMeta | undefined {
  return (NETWORKS as Record<string, NetworkMeta>)[caip2];
}

export function explorerTxUrl(caip2: string, txHash: string): string {
  const meta = getNetworkMeta(caip2);
  const base = meta?.explorer ?? injectiveEvm.blockExplorers.default.url;
  return `${base}/tx/${txHash}`;
}

/** USDC on Injective mainnet has 6 decimals. */
export const USDC_DECIMALS = 6;

/** Convert a decimal USDC string/number to smallest units (bigint). */
export function usdcToUnits(amount: number | string): bigint {
  const n = typeof amount === "string" ? amount : amount.toFixed(USDC_DECIMALS);
  const [whole, frac = ""] = n.split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole || "0") * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || "0");
}

/** Convert smallest-unit USDC (string/bigint) to a decimal number. */
export function unitsToUsdc(units: bigint | string): number {
  const u = typeof units === "string" ? BigInt(units) : units;
  return Number(u) / 10 ** USDC_DECIMALS;
}

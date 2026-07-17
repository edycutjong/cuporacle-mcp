/**
 * x402 client wrapper — the honest-depth core of CupOracle.
 *
 * Wraps @injectivelabs/x402's client primitives with CupOracle's spend
 * governance so an agent pays for a vetted edge *itself*, under a cap, and can
 * cite the on-chain receipt. The handshake (verified against the library's own
 * client source, not guessed):
 *
 *   1. POST /api/edge            → 402 with `accepts` (body) or PAYMENT-REQUIRED (header)
 *   2. parse quote → checkSpend  → sign EIP-3009 authorization (LOCAL, no broadcast)
 *   3. retry with PAYMENT-SIGNATURE header
 *   4. 200 carries PAYMENT-RESPONSE (base64 {success, transaction, network, payer})
 *      → transaction is the receipt tx hash the agent cites.
 *
 * Signing is offline (viem signTypedData); only settlement needs gas, which the
 * facilitator pays. So we can prove the crypto against a recorded quote with no
 * funds and no live server — which is exactly what this build session does.
 */
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import {
  parsePaymentRequired,
  parsePaymentResponseHeader,
  encodePaymentSignatureHeader,
  type PaymentResponseReceipt,
} from "@injectivelabs/x402/client";
import { PaymentRequiredSchema } from "@injectivelabs/x402/schemas";
import { signAuthorization, createNonce } from "@injectivelabs/x402/eip3009";
import {
  isInjectiveNetwork,
  getViemChain,
  getRpcUrl,
  getToken,
  type PaymentRequirements,
  type PaymentRequired,
  type PaymentPayload,
} from "@injectivelabs/x402";
import { CupOracleError, CCTP_FUND_HINT } from "../errors.js";
import { unitsToUsdc } from "../networks.js";

export type { PaymentResponseReceipt };

export interface X402Quote {
  network: string;
  /** smallest-unit amount (decimal string). */
  amount: string;
  amountUnits: bigint;
  amountUsdc: number;
  asset: `0x${string}`;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  scheme: string;
  requirement: PaymentRequirements;
}

const DEFAULT_PREFERRED = ["eip155:1776", "eip155:1439"] as const;

/** Validate a raw 402 body into a typed PaymentRequired (throws on malformed). */
export function parsePaymentRequiredBody(body: unknown): PaymentRequired {
  return PaymentRequiredSchema.parse(body) as PaymentRequired;
}

/** Choose the first supported Injective requirement from a 402's `accepts`. */
export function chooseRequirement(
  accepts: PaymentRequirements[],
  preferred: readonly string[] = DEFAULT_PREFERRED,
): PaymentRequirements | undefined {
  for (const net of preferred) {
    const found = accepts.find((r) => r.network === net && isInjectiveNetwork(r.network));
    if (found) return found;
  }
  return accepts.find((r) => isInjectiveNetwork(r.network));
}

/** Turn a validated PaymentRequired into a single actionable quote. */
export function quoteFromPaymentRequired(
  pr: PaymentRequired,
  preferred: readonly string[] = DEFAULT_PREFERRED,
): X402Quote {
  const chosen = chooseRequirement(pr.accepts, preferred);
  if (!chosen) {
    throw new CupOracleError("UPSTREAM_UNAVAILABLE", "402 quote has no supported Injective network.", {
      details: { offered: pr.accepts.map((r) => r.network) },
    });
  }
  const amountUnits = BigInt(chosen.amount);
  return {
    network: chosen.network,
    amount: chosen.amount,
    amountUnits,
    amountUsdc: unitsToUsdc(amountUnits),
    asset: chosen.asset,
    payTo: chosen.payTo,
    maxTimeoutSeconds: chosen.maxTimeoutSeconds,
    scheme: chosen.scheme,
    requirement: chosen,
  };
}

/** Read requirements from a 402 Response (body.accepts first, then header). */
export async function quoteFromResponse(
  res: Response,
  preferred: readonly string[] = DEFAULT_PREFERRED,
): Promise<X402Quote> {
  // Spec-compliant path: JSON body with `accepts`.
  try {
    const body = await res.clone().json();
    const pr = parsePaymentRequiredBody(body);
    return quoteFromPaymentRequired(pr, preferred);
  } catch {
    // Legacy path: base64 PAYMENT-REQUIRED header.
  }
  const header = res.headers.get("PAYMENT-REQUIRED");
  if (header) {
    const pr = parsePaymentRequired(header);
    return quoteFromPaymentRequired(pr, preferred);
  }
  throw new CupOracleError("UPSTREAM_UNAVAILABLE", "402 response had no recognizable payment requirements.");
}

/**
 * Sign the quote's EIP-3009 transfer authorization LOCALLY (no broadcast, no
 * funds). Produces a real PaymentPayload and its base64 PAYMENT-SIGNATURE
 * header. `rpcUrl` is only used to construct the wallet client; signTypedData
 * does not hit the network. Token name defaults to the registry entry so this
 * works fully offline; the live client path (createPayment) reads it from chain.
 */
export async function signQuote(
  privateKey: `0x${string}`,
  quote: X402Quote,
  opts?: { rpcUrl?: string; tokenName?: string },
): Promise<{ payload: PaymentPayload; header: string }> {
  const network = quote.network;
  if (!isInjectiveNetwork(network)) {
    throw new CupOracleError("UPSTREAM_UNAVAILABLE", `Unsupported network in quote: ${network}`);
  }
  const chain = getViemChain(network);
  const rpcUrl = opts?.rpcUrl ?? getRpcUrl(network);
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const tokenName =
    opts?.tokenName ?? getToken(network, "USDC")?.name ?? "USDC";
  const version = getToken(network, "USDC")?.eip712Version ?? "2";

  const now = BigInt(Math.floor(Date.now() / 1000));
  const auth = {
    from: account.address,
    to: quote.payTo,
    value: quote.amountUnits,
    validAfter: now - 10n,
    validBefore: now + BigInt(quote.maxTimeoutSeconds),
    nonce: createNonce(),
  };
  const signature = await signAuthorization(walletClient, quote.asset, tokenName, chain.id, auth, version);
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted: quote.requirement,
    payload: {
      signature,
      authorization: {
        from: auth.from,
        to: auth.to,
        value: auth.value.toString(),
        validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(),
        nonce: auth.nonce,
      },
    },
  };
  return { payload, header: encodePaymentSignatureHeader(payload) };
}

export interface PaidFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
  receipt?: PaymentResponseReceipt;
  quote: X402Quote;
}

/**
 * Full live paid fetch: first request → 402 → spend-gated sign → retry → parse
 * receipt. FUNDS-GATED: settlement needs the payer wallet funded with USDC + a
 * facilitator with gas. Used by wc_edge's live path and paid-call-smoke.
 *
 * `onQuote` is the governance hook: it runs after the quote is parsed and
 * before signing; throw from it (e.g. SPEND_CAP_HIT) to abort without paying.
 */
export async function paidFetch(
  url: string,
  init: RequestInit,
  privateKey: `0x${string}`,
  onQuote: (quote: X402Quote) => void | Promise<void>,
  preferred: readonly string[] = DEFAULT_PREFERRED,
): Promise<PaidFetchResult> {
  let first: Response;
  try {
    first = await fetch(url, init);
  } catch (err) {
    throw new CupOracleError("UPSTREAM_UNAVAILABLE", `Could not reach edge provider: ${(err as Error).message}`);
  }

  if (first.status !== 402) {
    const body = await safeJson(first);
    return { ok: first.ok, status: first.status, body, quote: undefined as never };
  }

  const quote = await quoteFromResponse(first, preferred);
  await onQuote(quote); // spend-cap gate

  const { header } = await signQuote(privateKey, quote);
  const headers = new Headers(init.headers);
  headers.set("PAYMENT-SIGNATURE", header);
  headers.set("X-PAYMENT", header); // legacy-server compat

  let retry: Response;
  try {
    retry = await fetch(url, { ...init, headers });
  } catch (err) {
    throw new CupOracleError("PAYMENT_DECLINED", `Retry after payment failed: ${(err as Error).message}`);
  }

  if (retry.status === 402 || retry.status === 403) {
    // Settlement rejected — most commonly the payer wallet is out of USDC.
    throw new CupOracleError("INSUFFICIENT_USDC", "Payment was not accepted by the facilitator.", {
      hint: CCTP_FUND_HINT,
      details: { status: retry.status },
    });
  }

  const body = await safeJson(retry);
  const receipt = parsePaymentResponseHeader(retry);
  return { ok: retry.ok, status: retry.status, body, receipt, quote };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.clone().json();
  } catch {
    return await res.text().catch(() => null);
  }
}

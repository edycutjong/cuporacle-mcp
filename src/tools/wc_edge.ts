/**
 * wc_edge — the depth centerpiece. An agent buys a CLV-audited edge for ~5
 * cents *itself* via x402, under a spend cap, and cites the on-chain receipt.
 *
 * Three honest modes:
 *   • live (default): POST LineLock /api/edge → 402 → spend-gated pay → 200 +
 *     receipt. FUNDS-GATED (needs a funded payer + a live upstream).
 *   • dry_run: parse the RECORDED 402 quote, enforce the spend cap, and (if a
 *     key is set) sign the EIP-3009 authorization LOCALLY to prove the client —
 *     WITHOUT paying. Never returns a receipt. This is the deterministic proof
 *     path used while the wallet is unfunded and LineLock isn't live yet.
 *   • degrade: if the upstream is unreachable or no wallet is configured, fall
 *     back to free consensus odds + "no vetted edge available". Never fabricates
 *     an edge or a receipt.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getMatchById } from "../data/football.js";
import { getOddsForMatch } from "../data/odds.js";
import { CupOracleError, CCTP_FUND_HINT } from "../errors.js";
import { checkSpend } from "../x402/spend.js";
import { paidFetch, quoteFromPaymentRequired, parsePaymentRequiredBody, signQuote } from "../x402/client.js";
import { getReceiptStore } from "../x402/receipts.js";
import { explorerTxUrl } from "../networks.js";
import { ok, guard, type ToolDef } from "./shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUOTE_FIXTURE = resolve(__dirname, "../../fixtures/edge-402-quote.json");

const inputSchema = {
  matchId: z.number().int().positive().describe("football-data match id (from wc_fixtures)."),
  maxSpend: z
    .number()
    .positive()
    .optional()
    .describe("Per-call USDC ceiling for this purchase (e.g. 0.05). Never exceeds the session cap."),
  dry_run: z
    .boolean()
    .optional()
    .describe(
      "If true, parse the recorded 402 quote and enforce the spend cap WITHOUT paying (proof path). " +
        "No receipt is produced. Default false (attempts a real, funds-gated purchase).",
    ),
};

async function degradeToOdds(matchId: number, reason: string, note: string) {
  const store = getReceiptStore();
  let odds: unknown = null;
  try {
    const match = await getMatchById(matchId);
    const res = await getOddsForMatch(match.data);
    odds = res.data;
  } catch {
    odds = null;
  }
  store.record({ when: new Date().toISOString(), tool: "wc_edge", matchId, amount_usdc: 0, status: "degraded", note: reason });
  return ok(
    {
      matchId,
      edge_available: false,
      reason,
      odds,
      receipt_tx: null,
      spent_usdc: 0,
      note,
    },
    `No vetted edge available for #${matchId} (${reason}). Falling back to free consensus odds. ${note}`,
  );
}

export const wcEdge: ToolDef = {
  name: "wc_edge",
  config: {
    title: "Buy a vetted edge (pays x402)",
    description:
      "Buy a CLV-audited edge + conviction ladder for one match from LineLock. The agent pays ~0.05 " +
      "USDC ITSELF via x402 (spend-capped) and returns the edge plus the on-chain receipt tx to cite. " +
      "Degrades to free odds if the upstream is down; never fabricates an edge or receipt. " +
      "Use dry_run:true to prove the quote-parse + spend-cap path without paying.",
    inputSchema,
    annotations: { readOnlyHint: false, openWorldHint: true, idempotentHint: false },
  },
  handler: guard(async (args: { matchId: number; maxSpend?: number; dry_run?: boolean }) => {
    const cfg = getConfig();
    const store = getReceiptStore();

    // ── DRY RUN: recorded-quote parse + spend-cap enforcement (no payment) ──
    if (args.dry_run) {
      const raw = JSON.parse(readFileSync(QUOTE_FIXTURE, "utf-8"));
      const pr = parsePaymentRequiredBody(raw);
      const quote = quoteFromPaymentRequired(pr, [cfg.network, "eip155:1776", "eip155:1439"]);
      // Enforce the cap — throws SPEND_CAP_HIT (typed) if the quote breaks policy.
      const decision = checkSpend({
        quoteUnits: quote.amountUnits,
        maxPerCall: args.maxSpend,
        sessionCap: cfg.maxSpendUsdc,
        sessionSpent: store.getSessionTotal(),
      });

      let signatureProduced = false;
      let signaturePreview: string | undefined;
      if (cfg.privateKey) {
        try {
          const { header } = await signQuote(cfg.privateKey, quote);
          signatureProduced = true;
          signaturePreview = `${header.slice(0, 24)}…(${header.length}b base64)`;
        } catch {
          signatureProduced = false;
        }
      }

      const structured = {
        mode: "dry_run",
        matchId: args.matchId,
        quote: {
          network: quote.network,
          amount_usdc: quote.amountUsdc,
          asset: quote.asset,
          payTo: quote.payTo,
          maxTimeoutSeconds: quote.maxTimeoutSeconds,
          scheme: quote.scheme,
        },
        spend_decision: {
          would_pay_usdc: decision.amountUsdc,
          session_cap_usdc: cfg.maxSpendUsdc,
          remaining_after_usdc: decision.remainingAfter,
        },
        signature_produced: signatureProduced,
        signature_preview: signaturePreview ?? null,
        receipt_tx: null,
        note:
          "DRY RUN — parsed the recorded 402 quote and enforced the spend cap. " +
          (signatureProduced
            ? "Signed the EIP-3009 authorization locally (no broadcast). "
            : "No payer key set, so signing was skipped. ") +
          "NO payment was made and NO receipt exists.",
      };
      const summary =
        `wc_edge DRY RUN #${args.matchId}: quote ${quote.amountUsdc} USDC on ${quote.network} → ` +
        `pay-to ${quote.payTo}. Cap OK (remaining ${decision.remainingAfter} USDC). ` +
        `Signature produced: ${signatureProduced}. No payment made.`;
      return ok(structured, summary);
    }

    // ── LIVE PAID PATH (funds-gated) ──
    if (!cfg.privateKey) {
      return degradeToOdds(
        args.matchId,
        "no_wallet_configured",
        "Set CUPORACLE_PRIVATE_KEY to a funded payer wallet to enable paid edges. Meanwhile, here are free odds.",
      );
    }

    const url = `${cfg.lineLockUrl}/api/edge`;
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId: args.matchId }),
    };

    let result;
    try {
      result = await paidFetch(url, init, cfg.privateKey, (quote) => {
        // Governance gate — throws SPEND_CAP_HIT before any signing/payment.
        checkSpend({
          quoteUnits: quote.amountUnits,
          maxPerCall: args.maxSpend,
          sessionCap: cfg.maxSpendUsdc,
          sessionSpent: store.getSessionTotal(),
        });
      }, [cfg.network, "eip155:1776", "eip155:1439"]);
    } catch (err) {
      if (err instanceof CupOracleError) {
        if (err.code === "UPSTREAM_UNAVAILABLE") {
          return degradeToOdds(args.matchId, "upstream_unreachable", "LineLock was unreachable. Here are free odds instead.");
        }
        if (err.code === "SPEND_CAP_HIT") {
          store.record({ when: new Date().toISOString(), tool: "wc_edge", matchId: args.matchId, amount_usdc: 0, status: "capped", note: err.message });
          throw err;
        }
        if (err.code === "INSUFFICIENT_USDC") {
          store.record({ when: new Date().toISOString(), tool: "wc_edge", matchId: args.matchId, amount_usdc: 0, status: "error", note: "insufficient_usdc" });
          throw new CupOracleError("INSUFFICIENT_USDC", err.message, { hint: CCTP_FUND_HINT });
        }
      }
      throw err;
    }

    if (!result.ok || !result.receipt || !result.receipt.success) {
      store.record({ when: new Date().toISOString(), tool: "wc_edge", matchId: args.matchId, amount_usdc: 0, status: "declined", note: `status ${result.status}` });
      throw new CupOracleError("PAYMENT_DECLINED", `Edge purchase did not settle (status ${result.status}).`, {
        hint: "The facilitator did not return a successful PAYMENT-RESPONSE. No edge is returned; try again or check funding.",
      });
    }

    // Genuine paid success — cite the real receipt.
    const bodyObj = (result.body ?? {}) as Record<string, unknown>;
    const edge = (bodyObj.edge ?? bodyObj) as Record<string, unknown>;
    const spent = result.quote.amountUsdc;
    store.record({
      when: new Date().toISOString(),
      tool: "wc_edge",
      matchId: args.matchId,
      amount_usdc: spent,
      receipt_tx: result.receipt.transaction,
      network: result.receipt.network,
      status: "paid",
    });
    const structured = {
      matchId: args.matchId,
      edge_available: true,
      edge,
      spent_usdc: spent,
      receipt_tx: result.receipt.transaction,
      receipt_network: result.receipt.network,
      payer: result.receipt.payer,
      explorer_url: explorerTxUrl(result.receipt.network, result.receipt.transaction),
      note: "Paid via x402. Cite receipt_tx; verify it with receipt_verify.",
    };
    const summary =
      `Bought edge for #${args.matchId} — paid ${spent} USDC. ` +
      `Receipt ${result.receipt.transaction} (${structured.explorer_url}).`;
    return ok(structured, summary);
  }),
};

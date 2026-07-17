/**
 * wc_spend_ledger — the agent's own auditable purchase history.
 *
 * Completes the governance story: an agent whose spending is inspectable
 * in-conversation. Shows every wc_edge attempt (paid / degraded / capped),
 * the receipt tx for paid ones, and the session total vs the cap.
 */
import { z } from "zod";
import { getConfig } from "../config.js";
import { getReceiptStore } from "../x402/receipts.js";
import { ok, guard, type ToolDef } from "./shared.js";

const outputSchema = {
  entries: z.array(
    z.object({
      when: z.string(),
      tool: z.string(),
      matchId: z.number().optional(),
      amount_usdc: z.number(),
      receipt_tx: z.string().optional(),
      network: z.string().optional(),
      status: z.string(),
      note: z.string().optional(),
    }),
  ),
  session_total_usdc: z.number(),
  cap_usdc: z.number(),
  remaining_usdc: z.number(),
  paid_count: z.number(),
};

export const wcSpendLedger: ToolDef = {
  name: "wc_spend_ledger",
  config: {
    title: "Agent spend ledger",
    description:
      "The agent's own purchase history: every wc_edge attempt with amount and receipt tx, plus the " +
      "session total against the spend cap. Free, read-only — the audit trail for autonomous spend.",
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: guard(async () => {
    const cfg = getConfig();
    const view = getReceiptStore().view(cfg.maxSpendUsdc);
    const structured = { ...view } as Record<string, unknown>;
    const lines = view.entries
      .slice(-10)
      .map(
        (e) =>
          `  ${e.when}  ${e.tool}${e.matchId ? " #" + e.matchId : ""}  ${e.status.toUpperCase()}` +
          `  ${e.amount_usdc} USDC${e.receipt_tx ? "  tx=" + e.receipt_tx : ""}`,
      );
    const summary =
      `Spend ledger — ${view.paid_count} paid call(s), ` +
      `session total ${view.session_total_usdc}/${view.cap_usdc} USDC ` +
      `(remaining ${view.remaining_usdc}):\n` +
      (lines.length ? lines.join("\n") : "  (no entries yet)");
    return ok(structured, summary);
  }),
};

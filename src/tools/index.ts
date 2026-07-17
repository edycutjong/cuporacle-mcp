/** All 8 CupOracle tools, in canonical order. */
import type { ToolDef } from "./shared.js";
import { wcFixtures } from "./wc_fixtures.js";
import { wcLive } from "./wc_live.js";
import { wcOdds } from "./wc_odds.js";
import { wcBracket } from "./wc_bracket.js";
import { wcEdge } from "./wc_edge.js";
import { receiptVerify } from "./receipt_verify.js";
import { walletFundGuide } from "./wallet_fund_guide.js";
import { wcSpendLedger } from "./wc_spend_ledger.js";

export const ALL_TOOLS: ToolDef[] = [
  wcFixtures,
  wcLive,
  wcOdds,
  wcBracket,
  wcEdge,
  receiptVerify,
  walletFundGuide,
  wcSpendLedger,
];

export {
  wcFixtures,
  wcLive,
  wcOdds,
  wcBracket,
  wcEdge,
  receiptVerify,
  walletFundGuide,
  wcSpendLedger,
};
export type { ToolDef };

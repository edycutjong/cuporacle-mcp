/**
 * Spend governance — the responsible-autonomy core.
 *
 * Before any x402 payment CupOracle checks three gates:
 *   1. per-call max   (a single quote can't exceed maxPerCall)
 *   2. per-session cap (cumulative session spend can't exceed CUPORACLE_MAX_SPEND)
 *   3. human-in-the-loop above cap (SPEND_CAP_HIT tells the agent to ask the user)
 *
 * This is a wallet with a governor, not a hot wallet with vibes.
 */
import { CupOracleError } from "../errors.js";
import { unitsToUsdc } from "../networks.js";

export interface SpendCheckInput {
  /** Quote amount in smallest USDC units (from PaymentRequirements.amount). */
  quoteUnits: bigint;
  /** Optional per-call ceiling the caller passed to wc_edge (decimal USDC). */
  maxPerCall?: number;
  /** Session cap (decimal USDC). */
  sessionCap: number;
  /** Already-spent this session (decimal USDC). */
  sessionSpent: number;
}

export interface SpendDecision {
  amountUsdc: number;
  amountUnits: bigint;
  remainingAfter: number;
}

/**
 * Throws a typed SPEND_CAP_HIT if a quote would break policy; otherwise returns
 * the vetted amount. Callers pay only after this passes.
 */
export function checkSpend(input: SpendCheckInput): SpendDecision {
  const amountUsdc = unitsToUsdc(input.quoteUnits);

  if (input.maxPerCall != null && amountUsdc > input.maxPerCall + 1e-9) {
    throw new CupOracleError(
      "SPEND_CAP_HIT",
      `Quote is ${amountUsdc} USDC but this call's maxSpend is ${input.maxPerCall} USDC.`,
      {
        hint: "Raise maxSpend on this wc_edge call, or decline. Never auto-exceed a per-call limit.",
        details: { quote_usdc: amountUsdc, max_per_call: input.maxPerCall },
      },
    );
  }

  const projected = input.sessionSpent + amountUsdc;
  if (projected > input.sessionCap + 1e-9) {
    throw new CupOracleError(
      "SPEND_CAP_HIT",
      `This purchase (${round6(amountUsdc)} USDC) would push session spend to ` +
        `${round6(projected)} USDC, over the ${input.sessionCap} USDC cap.`,
      {
        hint:
          "Ask the human to approve raising CUPORACLE_MAX_SPEND (restart the server with a higher " +
          "value), then retry. The agent must not raise its own cap.",
        details: {
          quote_usdc: round6(amountUsdc),
          session_spent_usdc: round6(input.sessionSpent),
          session_cap_usdc: input.sessionCap,
          would_be_usdc: round6(projected),
        },
      },
    );
  }

  return {
    amountUsdc: round6(amountUsdc),
    amountUnits: input.quoteUnits,
    remainingAfter: round6(input.sessionCap - projected),
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

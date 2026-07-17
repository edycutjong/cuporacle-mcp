/**
 * Typed error surface for CupOracle tools.
 *
 * Every failure an agent can hit is a named code with a human message and,
 * where useful, a `hint` that teaches the fix (e.g. INSUFFICIENT_USDC carries
 * the CCTP funding runbook). Failures teach, they don't just crash.
 */
export type CupOracleErrorCode =
  | "MATCH_NOT_FOUND"
  | "INSUFFICIENT_USDC"
  | "PAYMENT_DECLINED"
  | "SPEND_CAP_HIT"
  | "UPSTREAM_UNAVAILABLE"
  | "NO_WALLET_CONFIGURED"
  | "DATA_UNAVAILABLE"
  | "INVALID_INPUT"
  | "RECEIPT_NOT_FOUND";

export class CupOracleError extends Error {
  readonly code: CupOracleErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CupOracleErrorCode,
    message: string,
    opts?: { hint?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "CupOracleError";
    this.code = code;
    this.hint = opts?.hint;
    this.details = opts?.details;
  }

  toJSON(): { error: CupOracleErrorCode; message: string; hint?: string; details?: Record<string, unknown> } {
    return {
      error: this.code,
      message: this.message,
      ...(this.hint ? { hint: this.hint } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Short CCTP runbook attached to INSUFFICIENT_USDC so the fix is inline. */
export const CCTP_FUND_HINT =
  "Wallet is short on USDC on Injective. Fund it via CCTP: use the Injective MCP " +
  "server's account_balances → cctp_supported_chains → burn USDC on Base (domain 6) " +
  "→ cctp_attestation_status → cctp_mint. Or run the `wallet_fund_guide` tool for the " +
  "full step-by-step runbook.";

import { describe, it, expect } from "vitest";
import { checkSpend } from "../src/x402/spend.js";
import { CupOracleError } from "../src/errors.js";

const QUOTE_5C = 50_000n; // 0.05 USDC

describe("spend governance", () => {
  it("allows a quote within both per-call and session limits", () => {
    const d = checkSpend({ quoteUnits: QUOTE_5C, sessionCap: 0.5, sessionSpent: 0 });
    expect(d.amountUsdc).toBeCloseTo(0.05, 6);
    expect(d.remainingAfter).toBeCloseTo(0.45, 6);
  });

  it("throws SPEND_CAP_HIT when the quote exceeds the per-call max", () => {
    try {
      checkSpend({ quoteUnits: QUOTE_5C, maxPerCall: 0.01, sessionCap: 0.5, sessionSpent: 0 });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CupOracleError);
      expect((e as CupOracleError).code).toBe("SPEND_CAP_HIT");
    }
  });

  it("throws SPEND_CAP_HIT when cumulative session spend would exceed the cap", () => {
    // 10 nickels already spent = 0.50; the 11th trips the cap (SEED_DATA beat).
    try {
      checkSpend({ quoteUnits: QUOTE_5C, sessionCap: 0.5, sessionSpent: 0.5 });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as CupOracleError).code).toBe("SPEND_CAP_HIT");
      expect((e as CupOracleError).details).toMatchObject({ session_cap_usdc: 0.5 });
    }
  });

  it("permits the last nickel that exactly reaches the cap", () => {
    const d = checkSpend({ quoteUnits: QUOTE_5C, sessionCap: 0.5, sessionSpent: 0.45 });
    expect(d.remainingAfter).toBeCloseTo(0, 6);
  });

  it("carries a human-in-the-loop hint on cap hits", () => {
    try {
      checkSpend({ quoteUnits: QUOTE_5C, sessionCap: 0.04, sessionSpent: 0 });
      expect.unreachable();
    } catch (e) {
      expect((e as CupOracleError).hint).toMatch(/ask the human|maxSpend/i);
    }
  });
});

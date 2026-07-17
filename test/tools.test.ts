import { describe, it, expect, vi, afterEach } from "vitest";
import { wcEdge } from "../src/tools/wc_edge.js";
import { walletFundGuide } from "../src/tools/wallet_fund_guide.js";
import { wcSpendLedger } from "../src/tools/wc_spend_ledger.js";
import { receiptVerify } from "../src/tools/receipt_verify.js";
import { wcFixtures } from "../src/tools/wc_fixtures.js";

afterEach(() => vi.restoreAllMocks());

describe("wc_edge dry_run (recorded quote, no funds)", () => {
  it("parses the quote, enforces the cap, and signs locally", async () => {
    const res = await wcEdge.handler({ matchId: 537387, dry_run: true });
    const sc = res.structuredContent as any;
    expect(res.isError).toBeFalsy();
    expect(sc.mode).toBe("dry_run");
    expect(sc.quote.amount_usdc).toBeCloseTo(0.05, 6);
    expect(sc.quote.network).toBe("eip155:1776");
    expect(sc.spend_decision.would_pay_usdc).toBeCloseTo(0.05, 6);
    expect(sc.receipt_tx).toBeNull();
    // signature only if a payer key is configured in the env
    expect(typeof sc.signature_produced).toBe("boolean");
  });

  it("trips SPEND_CAP_HIT under a tiny per-call cap without paying", async () => {
    const res = await wcEdge.handler({ matchId: 537387, maxSpend: 0.01, dry_run: true });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("SPEND_CAP_HIT");
  });
});

describe("wc_edge graceful degradation", () => {
  it("falls back to free odds (never fabricates) when the upstream is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await wcEdge.handler({ matchId: 537387 });
    const sc = res.structuredContent as any;
    expect(res.isError).toBeFalsy();
    expect(sc.edge_available).toBe(false);
    expect(sc.receipt_tx).toBeNull();
    expect(sc.reason).toMatch(/unreachable|no_wallet/);
  });
});

describe("wallet_fund_guide", () => {
  it("returns the CCTP runbook with the right domain for base", async () => {
    const res = await walletFundGuide.handler({ chain: "base" });
    const sc = res.structuredContent as any;
    expect(sc.source_cctp_domain).toBe(6);
    expect(sc.injective_mcp_tools).toContain("cctp_mint");
    expect(sc.runbook_markdown).toContain("CCTP");
  });
  it("uses domain 3 for arbitrum", async () => {
    const res = await walletFundGuide.handler({ chain: "arbitrum" });
    expect((res.structuredContent as any).source_cctp_domain).toBe(3);
  });
});

describe("wc_spend_ledger", () => {
  it("returns a ledger view with a cap and remaining", async () => {
    const res = await wcSpendLedger.handler({});
    const sc = res.structuredContent as any;
    expect(sc).toHaveProperty("cap_usdc");
    expect(sc).toHaveProperty("remaining_usdc");
    expect(Array.isArray(sc.entries)).toBe(true);
  });
});

describe("receipt_verify", () => {
  it("returns RECEIPT_NOT_FOUND for a hash with no on-chain tx", async () => {
    // Stub the JSON-RPC transport so eth_getTransactionReceipt resolves null.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await receiptVerify.handler({ txHash: "0x" + "b".repeat(64) });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("RECEIPT_NOT_FOUND");
  });
});

describe("wc_fixtures (snapshot fallback under stubbed network)", () => {
  it("still returns fixtures when the live API is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const res = await wcFixtures.handler({ date: "2026-07-14" });
    const sc = res.structuredContent as any;
    expect(res.isError).toBeFalsy();
    expect(sc.snapshot).toBe(true);
    expect(sc.matches.some((m: any) => m.home === "France")).toBe(true);
  });
});

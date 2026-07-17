import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ALL_TOOLS } from "../src/tools/index.js";

const byName = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t]));

describe("tool registry shape", () => {
  it("exposes exactly the 8 canonical tools", () => {
    expect(ALL_TOOLS.map((t) => t.name).sort()).toEqual(
      [
        "receipt_verify",
        "wallet_fund_guide",
        "wc_bracket",
        "wc_edge",
        "wc_fixtures",
        "wc_live",
        "wc_odds",
        "wc_spend_ledger",
      ].sort(),
    );
  });

  it("every tool has a description and an output schema", () => {
    for (const t of ALL_TOOLS) {
      expect(t.config.description, `${t.name} description`).toBeTruthy();
    }
    // Every tool exposes structured output except wc_edge (union of modes).
    for (const t of ALL_TOOLS) {
      if (t.name !== "wc_edge") expect(t.config.outputSchema, `${t.name} outputSchema`).toBeTruthy();
    }
  });

  it("read-only tools are annotated readOnlyHint; wc_edge is not", () => {
    expect(byName.wc_fixtures.config.annotations?.readOnlyHint).toBe(true);
    expect(byName.receipt_verify.config.annotations?.readOnlyHint).toBe(true);
    expect(byName.wc_edge.config.annotations?.readOnlyHint).toBe(false);
  });
});

describe("wc_fixtures input schema", () => {
  const schema = z.object(byName.wc_fixtures.config.inputSchema!);
  it("accepts an omitted date", () => {
    expect(schema.parse({}).date).toBeUndefined();
  });
  it("accepts a well-formed date", () => {
    expect(schema.parse({ date: "2026-07-14" }).date).toBe("2026-07-14");
  });
  it("rejects a malformed date", () => {
    expect(() => schema.parse({ date: "14-07-2026" })).toThrow();
  });
});

describe("wc_live / wc_odds matchId schema", () => {
  const live = z.object(byName.wc_live.config.inputSchema!);
  it("accepts a positive integer id", () => {
    expect(live.parse({ matchId: 537387 }).matchId).toBe(537387);
  });
  it("rejects a non-positive or non-integer id", () => {
    expect(() => live.parse({ matchId: -1 })).toThrow();
    expect(() => live.parse({ matchId: 1.5 })).toThrow();
  });
});

describe("wc_edge input schema", () => {
  const schema = z.object(byName.wc_edge.config.inputSchema!);
  it("accepts matchId with optional maxSpend and dry_run", () => {
    const p = schema.parse({ matchId: 537387, maxSpend: 0.05, dry_run: true });
    expect(p).toMatchObject({ matchId: 537387, maxSpend: 0.05, dry_run: true });
  });
  it("rejects a negative maxSpend", () => {
    expect(() => schema.parse({ matchId: 1, maxSpend: -0.01 })).toThrow();
  });
});

describe("receipt_verify input schema", () => {
  const schema = z.object(byName.receipt_verify.config.inputSchema!);
  it("accepts a 32-byte 0x tx hash", () => {
    const hash = "0x" + "a".repeat(64);
    expect(schema.parse({ txHash: hash }).txHash).toBe(hash);
  });
  it("rejects a malformed hash", () => {
    expect(() => schema.parse({ txHash: "0x1234" })).toThrow();
  });
  it("constrains network to the two Injective CAIP-2 ids", () => {
    expect(() => schema.parse({ txHash: "0x" + "a".repeat(64), network: "eip155:1" })).toThrow();
  });
});

describe("wallet_fund_guide input schema", () => {
  const schema = z.object(byName.wallet_fund_guide.config.inputSchema!);
  it("defaults chain to optional and constrains the enum", () => {
    expect(schema.parse({}).chain).toBeUndefined();
    expect(schema.parse({ chain: "base" }).chain).toBe("base");
    expect(() => schema.parse({ chain: "solana" })).toThrow();
  });
});

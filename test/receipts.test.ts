import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { ReceiptStore } from "../src/x402/receipts.js";

function freshStore(): ReceiptStore {
  return new ReceiptStore(resolve(tmpdir(), `cuporacle-test-${randomBytes(6).toString("hex")}.json`));
}

describe("receipt store + session accounting", () => {
  it("starts empty with a zero session total", () => {
    const s = freshStore();
    const v = s.view(0.5);
    expect(v.entries).toHaveLength(0);
    expect(v.session_total_usdc).toBe(0);
    expect(v.remaining_usdc).toBe(0.5);
  });

  it("counts only paid entries toward the session total", () => {
    const s = freshStore();
    s.record({ when: "t1", tool: "wc_edge", amount_usdc: 0.05, status: "paid", receipt_tx: "0xaaa" });
    s.record({ when: "t2", tool: "wc_edge", amount_usdc: 0, status: "degraded" });
    s.record({ when: "t3", tool: "wc_edge", amount_usdc: 0.05, status: "paid", receipt_tx: "0xbbb" });
    const v = s.view(0.5);
    expect(v.paid_count).toBe(2);
    expect(v.session_total_usdc).toBeCloseTo(0.1, 6);
    expect(v.remaining_usdc).toBeCloseTo(0.4, 6);
    expect(v.entries).toHaveLength(3);
  });

  it("finds an entry by receipt tx hash (case-insensitive)", () => {
    const s = freshStore();
    s.record({ when: "t1", tool: "wc_edge", amount_usdc: 0.05, status: "paid", receipt_tx: "0xABC123" });
    expect(s.findByTx("0xabc123")?.amount_usdc).toBe(0.05);
    expect(s.findByTx("0xnope")).toBeUndefined();
  });

  it("persists across store re-instantiation on the same path", () => {
    const path = resolve(tmpdir(), `cuporacle-persist-${randomBytes(6).toString("hex")}.json`);
    const a = new ReceiptStore(path);
    a.record({ when: "t1", tool: "wc_edge", amount_usdc: 0.05, status: "paid", receipt_tx: "0xdead" });
    const b = new ReceiptStore(path);
    expect(b.all()).toHaveLength(1);
    expect(b.findByTx("0xdead")).toBeDefined();
  });
});

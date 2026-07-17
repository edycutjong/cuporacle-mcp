/**
 * Receipt + spend store.
 *
 * Every wc_edge attempt (paid, degraded, or capped) is appended here so the
 * agent's spending is auditable in-conversation via wc_spend_ledger. Persisted
 * as JSON under CUPORACLE_HOME (default ~/.cuporacle) for durability; a separate
 * in-memory session counter drives the per-session spend cap.
 *
 * A JSON file (not sqlite) keeps `npm i` free of native builds — the store is
 * append-only and tiny (cents-scale purchases).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";

export type SpendStatus = "paid" | "degraded" | "capped" | "declined" | "error";

export interface SpendEntry {
  when: string; // ISO
  tool: string; // e.g. "wc_edge"
  matchId?: number;
  amount_usdc: number; // charged (0 for non-paid)
  receipt_tx?: string; // PAYMENT-RESPONSE.transaction
  network?: string;
  status: SpendStatus;
  note?: string;
}

export interface LedgerView {
  entries: SpendEntry[];
  session_total_usdc: number;
  cap_usdc: number;
  remaining_usdc: number;
  paid_count: number;
}

function defaultStorePath(): string {
  const home = process.env.CUPORACLE_HOME || resolve(homedir(), ".cuporacle");
  return resolve(home, "ledger.json");
}

export class ReceiptStore {
  private path: string;
  private entries: SpendEntry[] = [];
  /** Spend attributed to THIS process (drives the per-session cap). */
  private sessionTotal = 0;

  constructor(path?: string) {
    this.path = path || defaultStorePath();
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf-8"));
      if (Array.isArray(parsed?.entries)) this.entries = parsed.entries;
    } catch {
      this.entries = [];
    }
  }

  private persist(): void {
    try {
      const dir = dirname(this.path);
      mkdirSync(dir, { recursive: true });
      const data = JSON.stringify({ entries: this.entries }, null, 2);
      // Atomic write: create a uniquely-named sibling with an unpredictable
      // suffix (exclusive `wx` create, owner-only mode) and rename it over the
      // target. Avoids the predictable-path symlink/race window of writing the
      // final file in place, and guarantees readers never see a partial write.
      const tmp = resolve(dir, `.ledger.${randomBytes(8).toString("hex")}.tmp`);
      writeFileSync(tmp, data, { mode: 0o600, flag: "wx" });
      renameSync(tmp, this.path);
    } catch {
      // Non-fatal: an unwritable store must not break a paid call. The entry
      // still lives in-memory for this session's ledger view.
    }
  }

  /** Append an entry; only successful paid spends count toward the session cap. */
  record(entry: SpendEntry): void {
    this.entries.push(entry);
    if (entry.status === "paid") this.sessionTotal += entry.amount_usdc;
    this.persist();
  }

  /** Spend attributed to this process so far. */
  getSessionTotal(): number {
    return this.sessionTotal;
  }

  view(capUsdc: number): LedgerView {
    const remaining = Math.max(0, capUsdc - this.sessionTotal);
    return {
      entries: [...this.entries],
      session_total_usdc: round6(this.sessionTotal),
      cap_usdc: capUsdc,
      remaining_usdc: round6(remaining),
      paid_count: this.entries.filter((e) => e.status === "paid").length,
    };
  }

  findByTx(txHash: string): SpendEntry | undefined {
    const t = txHash.toLowerCase();
    return this.entries.find((e) => e.receipt_tx?.toLowerCase() === t);
  }

  all(): SpendEntry[] {
    return [...this.entries];
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

let singleton: ReceiptStore | undefined;
export function getReceiptStore(): ReceiptStore {
  if (!singleton) singleton = new ReceiptStore();
  return singleton;
}

/** For tests: override the singleton with an isolated store. */
export function _setReceiptStore(store: ReceiptStore | undefined): void {
  singleton = store;
}

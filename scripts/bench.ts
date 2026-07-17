/**
 * bench.ts — quick latency profile.
 *   • 10× wc_fixtures (cache hit/miss split — proves the 60s cache)
 *   • 5×  wc_edge dry_run (recorded quote → spend-cap check → local EIP-3009 sign)
 * Reports p50/p95. No funds, no live upstream.
 *
 *   npm run bench
 */
import { wcFixtures } from "../src/tools/wc_fixtures.js";
import { wcEdge } from "../src/tools/wc_edge.js";
import { dataCache } from "../src/data/cache.js";

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}
function ms(fn: () => Promise<unknown>): Promise<number> {
  const t = performance.now();
  return fn().then(() => performance.now() - t);
}
function summarize(label: string, xs: number[]): void {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(
    `${label.padEnd(28)} n=${xs.length}  p50=${pct(s, 50).toFixed(1)}ms  ` +
      `p95=${pct(s, 95).toFixed(1)}ms  mean=${mean.toFixed(1)}ms`,
  );
}

async function main(): Promise<void> {
  console.log("CupOracle bench\n");

  dataCache.clear();
  const cold = await ms(() => wcFixtures.handler({}));
  const warm: number[] = [];
  for (let i = 0; i < 9; i++) warm.push(await ms(() => wcFixtures.handler({})));
  console.log(`wc_fixtures cold (miss)      ${cold.toFixed(1)}ms`);
  summarize("wc_fixtures warm (cache hit)", warm);

  const edge: number[] = [];
  for (let i = 0; i < 5; i++) edge.push(await ms(() => wcEdge.handler({ matchId: 537387, dry_run: true })));
  summarize("wc_edge dry_run (parse+sign)", edge);

  console.log("\nNote: wc_edge dry_run signs the recorded quote locally (no chain, no funds).");
  console.log("Live paid p50/p95 (quote→facilitator→confirm) is measured by paid-call-smoke.ts once funded.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

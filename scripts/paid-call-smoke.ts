/**
 * paid-call-smoke.ts — the ONE script that moves real money. FUNDS-GATED.
 *
 * Runs a genuine wc_edge purchase against a LIVE LineLock upstream: 402 quote
 * → spend-cap → EIP-3009 sign → facilitator settle → receipt. It refuses to run
 * unless you explicitly opt in AND a payer key is present, because it spends
 * real USDC on Injective.
 *
 * Enable with:
 *   CUPORACLE_ALLOW_PAID=1 \
 *   LINELOCK_URL=https://<live-linelock> \
 *   CUPORACLE_PRIVATE_KEY=0x<funded-payer> \
 *   npm run paid-call-smoke -- <matchId>
 *
 * As of this build the wallet is UNFUNDED on Injective and LineLock is not yet
 * live, so this is a documented, deferred check — never run blind.
 */
import { getConfig } from "../src/config.js";
import { wcEdge } from "../src/tools/wc_edge.js";

async function main(): Promise<void> {
  const cfg = getConfig();
  const matchId = Number(process.argv[2] ?? "537387");

  if (process.env.CUPORACLE_ALLOW_PAID !== "1") {
    console.error(
      "REFUSING to spend: set CUPORACLE_ALLOW_PAID=1 to authorize a real paid wc_edge call.\n" +
        "This moves real USDC on Injective. See STATUS.md (blocked-on-funding).",
    );
    console.error("\nRunning a safe DRY RUN instead (no payment):\n");
    const dry = await wcEdge.handler({ matchId, dry_run: true });
    console.log(dry.content[0].text);
    process.exit(0);
  }

  if (!cfg.privateKey) {
    console.error("No CUPORACLE_PRIVATE_KEY set — cannot sign a payment. Aborting.");
    process.exit(1);
  }

  console.error(
    `\n⚠  PAID CALL: wc_edge(#${matchId}) against ${cfg.lineLockUrl}\n` +
      `   payer cap: ${cfg.maxSpendUsdc} USDC · network: ${cfg.network}\n`,
  );
  const t = performance.now();
  const res = await wcEdge.handler({ matchId, maxSpend: 0.05 });
  const dt = (performance.now() - t).toFixed(0);

  console.log(res.content[0].text);
  console.log(`\n(end-to-end ${dt}ms)`);
  if (res.isError) process.exit(2);
  const sc = res.structuredContent as { receipt_tx?: string; explorer_url?: string } | undefined;
  if (sc?.receipt_tx) {
    console.log(`\n✅ Receipt: ${sc.receipt_tx}\n   Verify: receipt_verify("${sc.receipt_tx}")\n   ${sc.explorer_url}`);
  }
}

main().catch((e) => {
  console.error("paid-call-smoke error:", e);
  process.exit(1);
});

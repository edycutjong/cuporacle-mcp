# STATUS — cuporacle-mcp (build session 2026-07-12)

Honest state of the build. Nothing here is aspirational; anything not yet
possible is listed under a blocked section with the exact unblock condition.

## ✅ Done (built + verified this session)

- **MCP server scaffold** over stdio (`@modelcontextprotocol/sdk` 1.29.0):
  8 tools + 2 resources (`wc://bracket`, `wc://ledger`) + 1 prompt (`analyze-match`).
- **`scripts/smoke.ts`** lists all 8 tools / 2 resources / 1 prompt over real
  stdio and makes a live free call. Passes against **both** the TS source and the
  **built `dist/` artifact** (`SMOKE_BIN=dist`).
- **Official MCP Inspector** (`@modelcontextprotocol/inspector` 0.22.0) confirms
  `tools/list` (8), `resources/list` (2), `prompts/list` (1) on the built server.
- **4 free data tools** (`wc_fixtures`, `wc_live`, `wc_odds`, `wc_bracket`) return
  **real live World Cup 2026 data** (football-data.org comp 2000 + the-odds-api),
  with zod schemas, 60s cache, and labeled snapshot fallback.
- **`receipt_verify`** reads a tx over the Injective EVM RPC (viem) and decodes the
  USDC Transfer log → block time / amount / payer / payee / Blockscout link.
- **`wallet_fund_guide`** returns the CCTP runbook (routes to Injective MCP tools).
- **`wc_edge`** x402 **client**: parses the recorded 402 quote, enforces the spend
  cap, and signs the EIP-3009 authorization **locally** (proved with the real ops
  key — no funds moved). Degrades gracefully; never fabricates an edge/receipt.
- **`wc_spend_ledger`** + persistent receipt store; **spend governance** (per-call
  max, per-session cap, "ask human above cap") with typed errors.
- **AES-256-GCM keystore** + `cuporacle-mcp init` scaffold.
- **63 vitest passing** (target was ~35): schemas, spend cap, 402-parse against the
  recorded quote, EIP-3009 sign round-trip, full stubbed handshake, receipts,
  snapshot fallback, keystore, tool handlers.
- **Publish-ready**: `tsup` build → `dist/` (ESM + d.ts + shebang'd bin), `bin`
  wired, `files` allowlist, MIT `LICENSE`, `.env.example`.
- **Docs**: `README.md` (with "Injective technologies used"), `ARCHITECTURE.md`
  (mermaid), `DEMO.md`, `SKILL.md`, static `docs/index.html`, CI workflow.

## ▶️ Runnable now (no funding, no LineLock)

```bash
npm install
npm run smoke            # 8 tools/2 resources/1 prompt over stdio + a live free call
npm test                 # 63 vitest
npm run bench            # cache hit(0.0ms)/miss(~740ms) + wc_edge dry_run p50 ~1.6ms
npm run build && SMOKE_BIN=dist npm run smoke   # smoke the built artifact
npx tsx scripts/paid-call-smoke.ts 537387       # refuses to spend → prints a DRY RUN
```

- `wc_edge(matchId, dry_run:true)` — parses the recorded 402 quote, enforces the
  cap, signs locally. **No payment. No receipt.** This is the deterministic proof
  of the client while the wallet is unfunded.
- All 4 free tools return real data with the keys already in `.env.local`.

## ⛔ Blocked on funding (real mainnet `wc_edge` payment)

Wallet `0x95DdED219bD3d763A184eB4187056b9F238aAaA2` holds **13 USDC on Base** but
**0 INJ gas / 0 Base ETH / 0 USDC on Injective** (user funding separately — not
done). So a **real settled `wc_edge` tx cannot be produced yet.**

- **What's ready:** the entire client path (`paidFetch` → quote → cap → sign →
  retry → parse `PAYMENT-RESPONSE`) is coded and unit-tested against a stubbed
  transport. `scripts/paid-call-smoke.ts` runs it for real behind
  `CUPORACLE_ALLOW_PAID=1`.
- **Unblock:** CCTP USDC (a few cents) onto Injective mainnet + a little INJ →
  run `CUPORACLE_ALLOW_PAID=1 LINELOCK_URL=<live> npm run paid-call-smoke`. The
  returned `receipt_tx` then verifies via `receipt_verify` + Blockscout.
- Prefer testnet `eip155:1439` for a live handshake before spending mainnet cents.
- **Not faked:** no receipt hash in the repo is presented as a real settlement.
  `fixtures/edge-success.json` uses an all-zero placeholder tx, only for shape
  tests, and `wc_edge` only ever cites a receipt returned by a genuine paid call.

## ⛔ Blocked on LineLock (live upstream swap)

`wc_edge`'s only external dependency is LineLock's `POST /api/edge`, built in
parallel and not yet frozen/live.

- **What's ready:** the client codes to the agreed contract (`{ fixture,
  kickoff_utc, model_prob, market_odds, edge_pct, ladder[], similar_settled[],
  pick_hash }` on the paid retry; receipt in `PAYMENT-RESPONSE`). Tested against
  `fixtures/edge-402-quote.json` + `fixtures/edge-success.json`.
- **Unblock:** set `LINELOCK_URL=https://<live-linelock>` — a one-line swap. If
  the real shape differs, it's a fixture update, not a code change.
- Until then, `wc_edge` (non-dry-run) **degrades** to free `wc_odds` + "no vetted
  edge available", recorded as a `degraded` ledger entry.

## Deferred / not in this session

- `npm publish` (needs login; package is publish-*ready* only — no publish run).
- `npm publish --provenance` via GitHub OIDC (CI workflow written; not executed).
- Live per-match screenshots for the X thread (needs the demo recording pass).

## Definition-of-done checklist (from _BUILD_BRIEF.md)

- [x] Installs clean; smoke lists 8 tools + 2 resources + 1 prompt over stdio.
- [x] 4 free data tools return real World Cup data.
- [x] `wc_edge` parses the recorded 402 quote, enforces the cap, cites the receipt
      from `PAYMENT-RESPONSE` (client path), graceful `INSUFFICIENT_USDC`/degrade.
      No live payment (funds-gated).
- [x] `receipt_verify` + `wc_spend_ledger` implemented; typed errors in place.
- [x] 63 vitest passing (target ~35); MCP Inspector conformance runs.
- [x] `SKILL.md`, README tech section, `DEMO.md`, and this `STATUS.md`.

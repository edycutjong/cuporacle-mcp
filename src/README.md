# 🧩 src/ — CupOracle MCP server

> The TypeScript source for CupOracle: an `McpServer` (`server.ts`) that registers 8 tools, 2 resources (`wc://bracket`, `wc://ledger`) and 1 prompt (`analyze-match`), plus the data clients, x402 payment core and spend governance behind them. `tsup` bundles it to `dist/`; the bin boots it over stdio JSON-RPC (stdout = protocol, stderr = logs).

**[↩ Root README](../README.md)** · **[🏗️ Architecture](../docs/ARCHITECTURE.md)** · **[▶ Demo](../docs/DEMO.md)**

## 📦 What's here

| Path | Purpose |
| --- | --- |
| `server.ts` | Builds the wired `McpServer` (`createServer`) and boots it over stdio (`startStdio`); registers all tools, resources and the prompt. |
| `config.ts` | Lazy config + tiny `.env.local`/`.env` loader; reads keys, spend cap, network, LineLock URL. |
| `errors.ts` | `CupOracleError` — typed error codes (`SPEND_CAP_HIT`, `INSUFFICIENT_USDC`, …) each carrying a teaching `hint`. |
| `networks.ts` | Injective EVM network metadata re-exported from `@injectivelabs/x402/networks` (CAIP-2, RPC, USDC token, unit math). |
| `tools/` | The 8 tool handlers + `index.ts` (canonical `ALL_TOOLS` order) and `shared.ts` (uniform result shapes, non-crashing error wrapper). |
| `data/` | Read-side clients: `football.ts` (football-data.org), `odds.ts` (the-odds-api), `bracket.ts` (knockout assembly), `cache.ts` (60s TTL + in-flight de-dupe). |
| `x402/` | Payment core: `client.ts` (402 handshake + local EIP-3009 signing), `spend.ts` (spend gates), `receipts.ts` (append-only receipt/spend store). |
| `keystore/` | `keystore.ts` — AES-256-GCM (scrypt) at-rest keystore so a fresh machine can generate a payer key without pasting a seed. |

## 🧰 Tools, resources & prompt

8 tools (canonical order — 7 free, 1 pays):

| Tool | x402? | Does |
| --- | --- | --- |
| `wc_fixtures` | 🆓 free | List WC 2026 fixtures by date, or the next upcoming matches. |
| `wc_live` | 🆓 free | Live score, minute and status for one match by id. |
| `wc_odds` | 🆓 free | Consensus h2h odds + de-vigged implied probabilities. |
| `wc_bracket` | 🆓 free | Knockout bracket state (Round of 16 → Final) with scores/winners. |
| `wc_edge` | 💸 **pays x402** | Buys a CLV-audited edge from LineLock — agent pays ~0.05 USDC itself, spend-capped, returns the on-chain receipt tx. Degrades to free odds if upstream is down; `dry_run:true` proves the quote-parse + cap path without paying. |
| `receipt_verify` | 🆓 free | Reads an x402 USDC receipt over RPC, decodes the transfer, returns amount/payer/payee + explorer link. |
| `wallet_fund_guide` | 🆓 free | CCTP runbook to move USDC onto Injective (routes real moves to InjectiveLabs/mcp-server). |
| `wc_spend_ledger` | 🆓 free | Agent's own purchase history + session total vs cap — the autonomous-spend audit trail. |

**Resources:** `wc://bracket` (live bracket as text + JSON) · `wc://ledger` (spend history + session total vs cap).
**Prompt:** `analyze-match(matchId)` — guided fixture → odds → spend-capped edge → cite receipt workflow.

## 🚀 Run it

```bash
npm run dev         # tsx src/server.ts — runs the MCP server on stdio (dev)
npm run build       # tsup → dist/ (bundled server + bin)
npm run smoke       # scripts/smoke.ts — boots server, lists tools/resources/prompts, exercises free tools
npm run inspector   # build, then MCP Inspector CLI: tools/list + resources/list + prompts/list
```

Also: `npm test` (vitest), `npm run paid-call-smoke` (recorded-quote x402 path), `npm run ci` (typecheck + test + build + smoke).

## ⚙️ Environment

Read via `getConfig()` in `config.ts` (all optional — the server boots with none and degrades):

| Var | Default | Used for |
| --- | --- | --- |
| `FOOTBALL_DATA_KEY` | — | football-data.org auth (`wc_fixtures`/`wc_live`/`wc_bracket`); falls back to committed snapshot. |
| `ODDS_API_KEY` | — | the-odds-api auth (`wc_odds`); falls back to snapshot. |
| `CUPORACLE_PRIVATE_KEY` | — | 0x-hex payer key for x402. Absent → `wc_edge` can't pay (`NO_WALLET_CONFIGURED`). |
| `CUPORACLE_MAX_SPEND` | `0.50` | Per-session USDC spend cap. |
| `CUPORACLE_NETWORK` | `eip155:1776` | CAIP-2 payment network (Injective EVM mainnet). |
| `LINELOCK_URL` | `https://linelock.edycu.dev` | Upstream edge provider (sibling LineLock app). |
| `CUPORACLE_RPC_URL` | — | Optional RPC override for `receipt_verify`. |

## 🧪 Notes

- **Spend governance** (`x402/spend.ts`): every payment passes three gates — per-call max, per-session cap (`CUPORACLE_MAX_SPEND`), and human-in-the-loop above the cap (`SPEND_CAP_HIT` tells the agent to ask, never self-raise). A wallet with a governor, not a hot wallet with vibes.
- **Local EIP-3009 signing** (`x402/client.ts`): the 402 handshake signs the USDC authorization offline with viem (`signTypedData`) — no broadcast; the facilitator pays settlement gas. So the crypto is provable against a recorded quote with no funds and no live server (see `paid-call-smoke`).
- **Honest degrade** (`wc_edge`): if LineLock is unavailable it returns free consensus odds and says no vetted edge was available — it never fabricates an edge or a receipt. Every attempt (paid, degraded, capped, declined) is appended to the receipt store (`x402/receipts.ts`) under `CUPORACLE_HOME` (default `~/.cuporacle`).
- **Data resilience** (`data/`): 60s TTL cache with single in-flight promise per key; committed, clearly-labeled snapshots back every data API so tools never hard-crash mid-demo when quota/network fails.
- **Tests**: vitest suites in `../test/` cover schemas, x402, spend gates, data clients, receipts, keystore, tools and networks.

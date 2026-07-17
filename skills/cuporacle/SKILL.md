---
name: cuporacle
description: >-
  Use CupOracle to answer FIFA World Cup 2026 questions (fixtures, live scores,
  consensus odds, knockout bracket) and to buy a vetted, CLV-audited edge that
  the agent pays for ITSELF via x402 on Injective — under a spend cap, always
  citing the on-chain receipt. Invoke when the user asks about a World Cup match,
  "who's playing / who's through", "what are the odds", or "is it worth a bet".
---

# CupOracle — World Cup intelligence + autonomous paid edge

CupOracle is an MCP server (`cuporacle-mcp`). It gives you 8 tools, 2 resources
(`wc://bracket`, `wc://ledger`) and this Skill. Four tools are free data; one
(`wc_edge`) spends real USDC via x402 and must be used responsibly.

## Tool selection — question → tool

| The user asks… | Call | Notes |
|---|---|---|
| "What matches are on / tonight?" | `wc_fixtures(date?)` | Omit date for the next upcoming window. |
| "What's the score / is it live?" | `wc_live(matchId)` | Get the id from `wc_fixtures` first. |
| "What are the odds / who's favorite?" | `wc_odds(matchId)` | Consensus decimal odds + de-vigged probabilities. |
| "Who's through / show the bracket?" | `wc_bracket()` | Or read the `wc://bracket` resource. |
| "Is it worth a bet? Find me an edge." | `wc_edge(matchId)` | **Pays ~0.05 USDC.** See spend policy below. |
| "Prove that payment / check this receipt." | `receipt_verify(txHash)` | Reads the tx on Injective EVM. |
| "How do I fund the agent wallet?" | `wallet_fund_guide(chain?)` | CCTP runbook. Then use the Injective MCP server. |
| "What have you spent?" | `wc_spend_ledger()` | Session total vs cap + every receipt. Or `wc://ledger`. |

Always resolve a `matchId` with `wc_fixtures` before calling id-based tools.

## Spend policy (READ BEFORE CALLING `wc_edge`)

1. `wc_edge` pays for itself via x402 (no API key, no account). Each call costs
   roughly **0.05 USDC**. There is a **per-session cap** (`CUPORACLE_MAX_SPEND`,
   default **0.50 USDC**).
2. **Never raise your own cap.** If a call returns `SPEND_CAP_HIT`, STOP and ask
   the human to approve a higher cap (they restart the server with a new value).
   Do not retry in a loop.
3. Pass `maxSpend` to bound a single call (e.g. `wc_edge(matchId, maxSpend: 0.05)`).
4. **Always cite the receipt.** When you present a paid edge, quote `receipt_tx`
   and offer `receipt_verify(txHash)` so the user can confirm it on Injective.
   Format: *"Edge: … · Paid 0.05 USDC · Receipt `0x…` (verify with receipt_verify)."*
5. If LineLock is unreachable or the wallet is unfunded, `wc_edge` **degrades**
   to free `wc_odds` and says "no vetted edge available". **Never invent an edge
   or a receipt.** Present the free odds honestly instead.
6. To preview the payment logic without spending, call `wc_edge(matchId, dry_run: true)` —
   it parses the 402 quote and checks the cap but makes **no payment**.

## Fund-if-broke runbook (CCTP → Injective)

If `wc_edge` returns `INSUFFICIENT_USDC`, the wallet needs USDC on Injective.
CupOracle does **not** move funds — route these to the **InjectiveLabs/mcp-server**
running in the same harness:

1. `account_balances` — check the payer wallet on Injective and your USDC source.
2. `cctp_supported_chains` — confirm the source chain (e.g. Base = CCTP domain 6).
3. Burn USDC on the source chain (TokenMessengerV2) targeting the Injective wallet.
4. `cctp_attestation_status` — poll Circle's Iris until the attestation completes.
5. `cctp_mint` — mint native USDC on Injective EVM (`0xa00C…235a`).
6. Retry `wc_edge`. Fund only a few **cents** — the cap is deliberately low.

`wallet_fund_guide(chain)` returns this runbook as ready-to-read markdown.

## Live-data screenshot recipe (for match threads)

For a per-match snapshot: `wc_fixtures` → pick the id → `wc_live(id)` + `wc_odds(id)`,
then present the score line and consensus odds together. Live data updates each
call (free tools cache 60s; `wc_edge` is never cached).

## Honesty rules (non-negotiable)

- Never fabricate a receipt, tx hash, edge, or score.
- Free data may be served from a labeled **snapshot** if an API is down — say so.
- Credit: "Football data provided by the Football-Data.org API."

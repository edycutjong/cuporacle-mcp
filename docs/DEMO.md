# CupOracle — Demo Script

**The one devastating query:** *"What's tonight's Semi-Final, and is it worth a bet?"*
— typed into a stock Claude Desktop with two MCP servers configured: `cuporacle`
and the InjectiveLabs `injective-mcp`. Inside one conversation an LLM goes from
football-blind to quoting the live line **and cryptographically authorizing its
own on-chain payment** — deterministically, live, with no money moved.

> **Demo honesty (read once).** The on-stage magic moment uses `wc_edge`'s
> **dry-run**: it parses a **recorded** 402 quote, enforces the spend cap, and
> **signs the EIP-3009 authorization locally** — the hard cryptographic part the
> judge can *witness* — while making **no payment and returning no receipt**. A
> real *settled* tx is funds-gated (a few cents of USDC on Injective + a live
> LineLock upstream) and is shown as the clearly-labeled "when funded" beat at
> the end. CupOracle only ever cites a receipt hash returned by a **genuine paid
> call** — never the all-zero placeholder in `fixtures/`.

## Setup (once)

```bash
claude mcp add cuporacle \
  -e FOOTBALL_DATA_KEY=… -e ODDS_API_KEY=… \
  -e CUPORACLE_PRIVATE_KEY=0x… -e CUPORACLE_MAX_SPEND=0.50 \
  -- npx -y cuporacle-mcp
```

Verify it's live over stdio (real output, no secrets needed — falls back to a
labeled snapshot):

```bash
npm run smoke
# Tools (8): wc_fixtures · wc_live · wc_odds · wc_bracket · wc_edge ·
#            receipt_verify · wallet_fund_guide · wc_spend_ledger
# Resources (2): wc://bracket, wc://ledger   Prompts (1): analyze-match
# ✅ SMOKE PASS — 8 tools, 2 resources, 1 prompt over stdio; free tool call returned data.
```

---

## 3-minute script (timestamped) — the magic moment is at **1:20**

### 0:00–0:15 · Hook (football-blind)
Ask a stock assistant "what World Cup match is on tonight?" → *"I don't have live
sports data."* Cut to title card: **one install fixes this.**

### 0:15–0:35 · One config line → it speaks football
Paste the two-server config (cuporacle + injective-mcp) on screen, restart, and
run the smoke gate so the judge sees **8 tools / 2 resources / 1 prompt** register
over real stdio. Two servers, one harness — the interop story in one frame.

### 0:35–0:55 · football-blind → fixture-aware (free, real data)
**User:** "What World Cup matches are coming up?"
**Assistant calls** `wc_fixtures()` → **live** football-data.org (comp 2000):

```
4 World Cup fixture(s) upcoming:
  #537387  2026-07-14T19:00:00Z  [SEMI_FINALS]  France vs Spain  (TIMED)
  #537388  2026-07-15T19:00:00Z  [SEMI_FINALS]  England vs Argentina  (TIMED)
  #537389  2026-07-18T21:00:00Z  [THIRD_PLACE]  TBD vs TBD  (TIMED)
  #537390  2026-07-19T19:00:00Z  [FINAL]        TBD vs TBD  (TIMED)
Football data provided by the Football-Data.org API.
```

### 0:55–1:15 · consensus odds (free, real data)
**User:** "What are the odds for the semi?"
**Assistant calls** `wc_odds(537387)` → de-vigged consensus across the book set:

```
France vs Spain — consensus (50 books)
  home 2.307 (41.4%) | draw 3.232 (29.5%) | away 3.279 (29.1%)
```

*(Numbers are the live line on demo day; the shape is fixed.)*

### 1:15–1:45 · ⭐ THE MAGIC MOMENT — the agent authorizes its own payment
**User:** "Is it worth a bet?"
**Assistant calls** `wc_edge(537387, dry_run: true)`. On screen, real output:

```
wc_edge DRY RUN #537387: quote 0.05 USDC on eip155:1776
  → pay-to 0x45078eD96C2bB171009A47a57aF5C085Bf4fD0e3
  ▸ parsed the recorded 402 quote  (accepts: exact / eip155:1776 / USDC 0xa00C…235a)
  ▸ spend-cap OK — remaining 0.45 / 0.50 USDC this session
  ▸ Signature produced: TRUE   (EIP-3009 transferWithAuthorization, signed locally — no broadcast)
  receipt_tx: null   ·   NO payment was made and NO receipt exists.
```

> **The "oh."** In one line the LLM parsed a real x402 payment demand, checked it
> against its own budget, and **produced a valid cryptographic authorization to
> move USDC on Injective — by itself, under a cap, with no human and no money
> moved.** That is the buyer side of x402, witnessed live and reproducible on any
> laptop. The signature is real; only settlement (gas) is deferred.

### 1:45–2:10 · Governance (the pre-empt) — a wallet with a governor
Keep asking for edges. On the call that would breach the cap, `wc_edge` returns a
**typed** `SPEND_CAP_HIT` (not a crash):

```
{ "error": "SPEND_CAP_HIT",
  "message": "This purchase (0.05 USDC) would push session spend to 0.55 USDC, over the 0.50 cap.",
  "hint": "Ask the human to approve raising CUPORACLE_MAX_SPEND … The agent must not raise its own cap." }
```

**Assistant:** "I've hit my 0.50 USDC session cap — want me to continue? You'd need
to raise `CUPORACLE_MAX_SPEND`." Then **`wc_spend_ledger()`** shows the full trail
(every attempt, amount, status). This pre-answers *"you gave an LLM a wallet?!"*
before a judge can ask it.

### 2:10–2:30 · The four Injective techs, on screen
Show the README **"Injective technologies used"** table: **MCP server** (this
published package) · **x402** buyer client (the signature you just saw) · the
**cuporacle Agent Skill** (spend policy + tool routing) · **USDC + CCTP** funding
path (routes to the Injective MCP server's `cctp_mint`).

### 2:30–3:00 · Close
"One install. Your agent speaks football — and can pay for its own alpha,
responsibly." Repo + npm card.

---

## When funded — the live *settled* tx (post-judging / testnet)

The single beat this script deliberately does **not** stage live is a real,
on-chain settlement, because it needs money and a live upstream:

```bash
CUPORACLE_ALLOW_PAID=1 \
LINELOCK_URL=https://<live-linelock> \
CUPORACLE_PRIVATE_KEY=0x<funded-payer> \
npm run paid-call-smoke -- 537387
```

When that runs, `wc_edge` (non-dry-run) returns a **real** `receipt_tx`, and the
judge pastes it into `receipt_verify(txHash)` to read the amount + block time on
the Injective explorer. **Prefer testnet `eip155:1439` for a first live
handshake.** Until it's funded, `wc_edge` honestly **degrades** to free odds — it
never fabricates an edge or a receipt. See [`STATUS.md`](STATUS.md) for the exact
unblock conditions.

## Reproduce the magic moment without spending

```bash
npm test                                     # 63 vitest (402-parse · spend cap · EIP-3009 sign · degrade)
npx tsx scripts/paid-call-smoke.ts 537387    # refuses to spend → prints the DRY RUN above
npm run inspector                            # official MCP Inspector: tools/list · resources/list · prompts/list
```

---

## Pre-submission checklist (honest status — user steps, NOT done in-repo)

These are deliberately **not** faked in the docs. Fill each in before submitting:

- [x] **Demo video** — DONE: **https://youtu.be/FAI3_xZFTx0** (2:10 zero-funds cut — dry-run magic moment, SPEND_CAP_HIT governance, live Final data).
- [x] **npm publish** — DONE 2026-07-17: **`cuporacle-mcp@1.0.0` is live on npm** (https://www.npmjs.com/package/cuporacle-mcp); `npx -y cuporacle-mcp` works.
- [x] **Docs site deploy** — DONE: **live at https://cuporacle.edycu.dev/** (plus `/pitch/` and `/reference.html`).
- [ ] **Live settled receipt** — funds-gated (CCTP a few cents onto Injective + live LineLock). Optional for a strong submission; the dry-run proves the client.
- [ ] **Two X-post links** (intro + demo video) for the Typeform — video is live (https://youtu.be/FAI3_xZFTx0); posts still to publish.

## Notes for the recording
- Two-server config JSON on screen (cuporacle + injective-mcp) sells the interop.
- The two visual peaks: the gold **"Signature produced: TRUE"** line (1:20) and the
  amber `SPEND_CAP_HIT` card (1:45).
- Use live data for whichever match is on that day (SFs Jul 14–15, Final Jul 19).

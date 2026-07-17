# Contributing

Thanks for your interest in improving **cuporacle-mcp** — the missing World Cup
MCP server. 🎉

This is a stdio [Model Context Protocol](https://modelcontextprotocol.io) server
published as an npm package. There is **no web app** — the end-to-end proof is a
cold-start over real stdio (`npm run smoke`) plus the official MCP Inspector.

## Getting Started

1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Install dependencies: `npm install`
3. Copy the env template: `cp .env.example .env.local` and fill in the two free
   data keys ([football-data.org](https://www.football-data.org/) +
   [the-odds-api.com](https://the-odds-api.com/)). The four free tools work with
   just those; `wc_edge` additionally needs a payer key (fund only cents).
4. Run the server over stdio: `npm run dev` (or `npm run smoke` for a one-shot
   listing + live free call).

## Before You Open a PR

Run the local gate — all of these must pass (no browser, no Playwright):

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (unit + schema + spend-cap + 402-parse + EIP-3009)
npm run build       # tsup → dist/
npm run smoke       # cold-start over stdio: 8 tools / 2 resources / 1 prompt
npm run inspector   # official MCP Inspector conformance against dist/
```

- Add or update **vitest** tests for any behavior change (`test/`).
- Keep tool JSON schemas (`zod`) strict and typed errors meaningful.
- Preserve the honesty guarantees: `wc_edge` must **degrade** (never fabricate an
  edge or a receipt), the spend cap must never be self-raised, and no fixture may
  present a placeholder tx hash as a real settlement.
- Keep commits conventional (`feat:`, `fix:`, `docs:`, `chore:`).

## Adding a New Tool or Sport

Each tool is a `{ name, config, handler }` in `src/tools/`. To add one: copy a
free tool, swap the data client in `src/data/`, and register it in
`src/tools/index.ts`. The x402 client (`src/x402/`) is sport-agnostic — reuse it
to sell any premium signal. Update the smoke test's expected counts if you change
the tool/resource/prompt totals.

## Reporting Bugs / Requesting Features

Open an issue using the provided templates. Include repro steps (the exact MCP
call + arguments), expected vs. actual behavior, and your Node version.

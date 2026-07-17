# Deploy

Two automated pipelines ship this repo. Both live in `.github/workflows/`.
(CupOracle is a stdio MCP server distributed on **npm** — there is no long-running
web service to host, so there is no Railway pipeline.)

## 1. GitHub Pages — landing + pitch + reference (`pages.yml`)

Publishes the `docs/` folder (landing `docs/index.html`, pitch `docs/pitch/index.html`,
reference `docs/reference.html`, assets).

**One-time setup:** GitHub → repo **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.

**Triggers:** push to `main` touching `docs/**`, any published Release, or manual (`workflow_dispatch`).

**Live URLs:**
- Landing → https://edycutjong.github.io/cuporacle-mcp/
- Pitch → https://edycutjong.github.io/cuporacle-mcp/pitch/
- Reference → https://edycutjong.github.io/cuporacle-mcp/reference.html

## 2. npm publish (`publish.yml`)

Builds, tests, and publishes `cuporacle-mcp` to npm when a **GitHub Release is published**.

**One-time setup:**
1. Repo **Settings → Secrets and variables → Actions** → **Secret** `NPM_TOKEN` — an npm
   **automation** token with publish rights to `cuporacle-mcp`.
2. Bump `version` in `package.json`, commit, then create a GitHub Release with a `v*` tag.

**Triggers:** published Release, or manual (`workflow_dispatch`). The job runs
`npm ci → npm run build → npm test → npm publish --access public`.

After publish, the README install line works everywhere:
`claude mcp add cuporacle -- npx -y cuporacle-mcp`.

## Existing quality gates
`ci.yml` (typecheck + tests + build + smoke + MCP Inspector) and `codeql.yml` (security)
run on every push/PR — unchanged.

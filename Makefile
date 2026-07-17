# cuporacle-mcp — engineering harness convenience targets.
# This is a stdio MCP library (npm package), not a web app: the "E2E" layer is
# `make smoke` (cold-start over stdio) + `make inspector` (MCP Inspector), NOT
# Playwright/Lighthouse.

.PHONY: help install build test typecheck smoke smoke-dist inspector bench ci security-scan

help: ## Show this help
	@echo "cuporacle-mcp — make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (npm ci)
	npm ci

build: ## Build the publishable artifact (tsup -> dist/)
	npm run build

test: ## Run unit tests (vitest)
	npm test

typecheck: ## Type-check without emitting (tsc --noEmit)
	npm run typecheck

smoke: ## Cold-start over stdio: list 8 tools / 2 resources / 1 prompt + a live free call
	npm run smoke

smoke-dist: build ## Smoke the BUILT dist/ artifact (what npm ships)
	SMOKE_BIN=dist npm run smoke

inspector: ## Official MCP Inspector protocol conformance against dist/
	npm run inspector

bench: ## Cache hit/miss + wc_edge dry-run (parse+sign) p50/p95
	npm run bench

ci: typecheck test build smoke ## Local CI gate: typecheck + tests + build + stdio smoke

security-scan: ## Dependency + license audit (advisory)
	@echo "=== NPM AUDIT (high+) ==="
	npm audit --audit-level=high || true
	@echo ""
	@echo "=== LICENSE CHECK (no GPL/AGPL in prod deps) ==="
	npx --yes license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

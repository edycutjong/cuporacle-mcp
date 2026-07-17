/**
 * Configuration + lightweight .env loader.
 *
 * We avoid a hard `dotenv` dependency: a ~20-line parser loads `.env.local`
 * then `.env` (first wins) without clobbering already-set process.env values.
 * All config is read lazily through {@link getConfig} so tests can override env.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let envLoaded = false;

/** Parse and merge a dotenv-style file into process.env (does not overwrite existing keys). */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

/** Load `.env.local` then `.env` from the build root, once per process. */
export function loadEnv(cwd = process.cwd()): void {
  if (envLoaded) return;
  loadEnvFile(resolve(cwd, ".env.local"));
  loadEnvFile(resolve(cwd, ".env"));
  envLoaded = true;
}

export interface CupOracleConfig {
  footballDataKey: string | undefined;
  oddsApiKey: string | undefined;
  /** Payer private key for x402 (0x-hex). Undefined => wc_edge cannot pay. */
  privateKey: `0x${string}` | undefined;
  /** Per-session spend cap in USDC (decimal). Default 0.50. */
  maxSpendUsdc: number;
  /** CAIP-2 network id for payments. */
  network: string;
  /** Upstream edge provider base URL (sibling LineLock app). */
  lineLockUrl: string;
  /** Optional RPC override. */
  rpcUrl: string | undefined;
}

function parseKey(raw: string | undefined): `0x${string}` | undefined {
  if (!raw) return undefined;
  const k = raw.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(k)) return k as `0x${string}`;
  if (/^[0-9a-fA-F]{64}$/.test(k)) return (`0x${k}`) as `0x${string}`;
  return undefined;
}

export function getConfig(): CupOracleConfig {
  loadEnv();
  const maxRaw = process.env.CUPORACLE_MAX_SPEND;
  const maxSpend = maxRaw ? Number(maxRaw) : 0.5;
  return {
    footballDataKey: process.env.FOOTBALL_DATA_KEY,
    oddsApiKey: process.env.ODDS_API_KEY,
    privateKey: parseKey(process.env.CUPORACLE_PRIVATE_KEY),
    maxSpendUsdc: Number.isFinite(maxSpend) && maxSpend > 0 ? maxSpend : 0.5,
    network: process.env.CUPORACLE_NETWORK || "eip155:1776",
    lineLockUrl: (process.env.LINELOCK_URL || "https://linelock.edycu.dev").replace(/\/$/, ""),
    rpcUrl: process.env.CUPORACLE_RPC_URL,
  };
}

/** FIFA World Cup 2026 competition id on football-data.org. */
export const WC_COMPETITION_ID = 2000;
export const WC_SEASON = 2026;

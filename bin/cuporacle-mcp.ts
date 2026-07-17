#!/usr/bin/env node
/**
 * cuporacle-mcp — npx entrypoint.
 *
 *   cuporacle-mcp          start the MCP server over stdio (default)
 *   cuporacle-mcp init     generate a payer wallet + keystore scaffold
 *   cuporacle-mcp --help   usage
 *
 * The server speaks JSON-RPC on stdout, so all human output goes to stderr.
 */
import { resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { startStdio, SERVER_NAME, SERVER_VERSION } from "../src/server.js";
import { generateWallet, encryptKey, saveKeystore } from "../src/keystore/keystore.js";

const log = (s: string): void => {
  process.stderr.write(s + "\n");
};

function usage(): void {
  log(`${SERVER_NAME} v${SERVER_VERSION}
Usage:
  cuporacle-mcp            Start the MCP server over stdio (for your harness config)
  cuporacle-mcp init       Generate a fresh payer wallet + optional keystore
  cuporacle-mcp --help     Show this help

Env: FOOTBALL_DATA_KEY, ODDS_API_KEY, CUPORACLE_PRIVATE_KEY, CUPORACLE_MAX_SPEND,
     CUPORACLE_NETWORK (eip155:1776|eip155:1439), LINELOCK_URL`);
}

function runInit(): void {
  const home = process.env.CUPORACLE_HOME || resolve(homedir(), ".cuporacle");
  const ksPath = resolve(home, "keystore.json");
  const { privateKey, address } = generateWallet();

  log(`\n${SERVER_NAME} init — new payer wallet generated`);
  log(`  address:     ${address}`);
  log(`  private key: ${privateKey}`);
  log(`\n⚠  Save the private key now. Fund this address with a FEW CENTS of USDC on`);
  log(`   Injective (see the wallet_fund_guide tool / SKILL for the CCTP runbook).`);
  log(`   Then set CUPORACLE_PRIVATE_KEY=<key> in your harness env, or use the keystore.`);

  const password = process.env.CUPORACLE_KEYSTORE_PASSWORD;
  if (password) {
    if (existsSync(ksPath)) {
      log(`\n  keystore already exists at ${ksPath} — not overwriting.`);
    } else {
      const store = encryptKey(privateKey, password);
      saveKeystore(ksPath, store);
      log(`\n  encrypted keystore written to ${ksPath} (aes-256-gcm, scrypt).`);
    }
  } else {
    log(`\n  (set CUPORACLE_KEYSTORE_PASSWORD to also write an encrypted keystore.)`);
  }
  log(`\n  Config snippet (Claude Code):`);
  log(`    claude mcp add cuporacle -- npx -y cuporacle-mcp`);
  log("");
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === "--help" || arg === "-h" || arg === "help") return usage();
  if (arg === "init") return runInit();
  if (arg === "--version" || arg === "-v") return log(`${SERVER_NAME} v${SERVER_VERSION}`);
  await startStdio();
}

main().catch((err) => {
  process.stderr.write(`[cuporacle-mcp] fatal: ${err?.stack || err}\n`);
  process.exit(1);
});

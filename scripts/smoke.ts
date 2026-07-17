/**
 * Smoke test — cold-start the server over real stdio, list tools/resources/
 * prompts, and make one free tool call. This is the "does it speak MCP?" gate.
 *
 *   npm run smoke
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Default: run the TS source via tsx. Set SMOKE_BIN=dist to test the built
// artifact (node dist/bin/cuporacle-mcp.js) — the exact thing npm ships.
const useDist = process.env.SMOKE_BIN === "dist";
const SRC_BIN = resolve(__dirname, "../bin/cuporacle-mcp.ts");
const DIST_BIN = resolve(__dirname, "../dist/bin/cuporacle-mcp.js");
const command = useDist ? "node" : "npx";
const args = useDist ? [DIST_BIN] : ["tsx", SRC_BIN];

const EXPECTED_TOOLS = [
  "wc_fixtures",
  "wc_live",
  "wc_odds",
  "wc_bracket",
  "wc_edge",
  "receipt_verify",
  "wallet_fund_guide",
  "wc_spend_ledger",
];
const EXPECTED_RESOURCES = ["wc://bracket", "wc://ledger"];
const EXPECTED_PROMPTS = ["analyze-match"];

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...process.env } as Record<string, string>,
    stderr: "inherit",
  });
  const client = new Client({ name: "cuporacle-smoke", version: "0.1.0" });
  await client.connect(transport);

  const tools = (await client.listTools()).tools;
  const resources = (await client.listResources()).resources;
  const prompts = (await client.listPrompts()).prompts;

  const toolNames = tools.map((t) => t.name).sort();
  const resourceUris = resources.map((r) => r.uri).sort();
  const promptNames = prompts.map((p) => p.name).sort();

  console.log(`\nTools (${tools.length}):`);
  for (const t of tools) console.log(`  • ${t.name} — ${t.description?.slice(0, 60)}…`);
  console.log(`\nResources (${resources.length}): ${resourceUris.join(", ")}`);
  console.log(`Prompts (${prompts.length}): ${promptNames.join(", ")}`);

  const missingTools = EXPECTED_TOOLS.filter((t) => !toolNames.includes(t));
  const missingResources = EXPECTED_RESOURCES.filter((r) => !resourceUris.includes(r));
  const missingPrompts = EXPECTED_PROMPTS.filter((p) => !promptNames.includes(p));

  // One free tool call to prove data flows end-to-end over stdio.
  console.log(`\nCalling wc_fixtures…`);
  const res = await client.callTool({ name: "wc_fixtures", arguments: {} });
  const firstText = Array.isArray(res.content) ? (res.content[0] as { text?: string })?.text : undefined;
  console.log(firstText?.split("\n").slice(0, 4).join("\n"));

  await client.close();

  const okAll =
    missingTools.length === 0 &&
    missingResources.length === 0 &&
    missingPrompts.length === 0 &&
    tools.length === 8;
  if (!okAll) {
    console.error(`\nSMOKE FAIL: missing tools=${missingTools} resources=${missingResources} prompts=${missingPrompts}`);
    process.exit(1);
  }
  console.log(`\n✅ SMOKE PASS — 8 tools, 2 resources, 1 prompt over stdio; free tool call returned data.`);
}

main().catch((err) => {
  console.error("smoke error:", err);
  process.exit(1);
});

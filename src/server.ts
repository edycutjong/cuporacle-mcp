/**
 * CupOracle MCP server — full protocol citizenship.
 *
 * Registers 8 tools + 2 resources (wc://bracket, wc://ledger) + 1 prompt
 * (analyze-match) over stdio JSON-RPC. Most community servers ship tools only;
 * CupOracle publishes a complete server.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ALL_TOOLS } from "./tools/index.js";
import { getConfig } from "./config.js";
import { getBracket, renderBracketAscii } from "./data/bracket.js";
import { getReceiptStore } from "./x402/receipts.js";

export const SERVER_NAME = "cuporacle-mcp";
export const SERVER_VERSION = "0.1.0";

/** Build a fully-wired McpServer (used by the bin, smoke test, and inspector). */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
      instructions:
        "CupOracle adds FIFA World Cup 2026 awareness to your agent: fixtures, live scores, consensus " +
        "odds, and a paid wc_edge tool that buys a vetted edge via x402 (spend-capped) and cites the " +
        "on-chain receipt. Always cite receipt_tx when you present a paid edge; verify with receipt_verify.",
    },
  );

  // ── Tools ──
  for (const tool of ALL_TOOLS) {
    server.registerTool(tool.name, tool.config as never, tool.handler as never);
  }

  // ── Resources (read-only mirrors for resource-aware hosts) ──
  server.registerResource(
    "bracket",
    "wc://bracket",
    {
      title: "World Cup knockout bracket",
      description: "Live knockout bracket (Round of 16 → Final) as text + JSON.",
      mimeType: "application/json",
    },
    async (uri) => {
      const bracket = await getBracket();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ ascii: renderBracketAscii(bracket), rounds: bracket.rounds }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "ledger",
    "wc://ledger",
    {
      title: "Agent spend ledger",
      description: "The agent's x402 purchase history and session total vs cap.",
      mimeType: "application/json",
    },
    async (uri) => {
      const cfg = getConfig();
      const view = getReceiptStore().view(cfg.maxSpendUsdc);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(view, null, 2) }],
      };
    },
  );

  // ── Prompt: analyze-match (composes fixtures → odds → edge w/ spend policy) ──
  server.registerPrompt(
    "analyze-match",
    {
      title: "Analyze a World Cup match",
      description:
        "Guided workflow: look up the fixture, pull consensus odds, then decide whether to buy a vetted " +
        "edge under the spend cap — and cite the receipt.",
      argsSchema: {
        matchId: z.string().describe("football-data match id (as a string), e.g. 537387"),
      },
    },
    ({ matchId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Analyze World Cup match #${matchId}. Steps:\n` +
              `1. Call wc_live(${matchId}) and wc_odds(${matchId}) for current state and consensus odds.\n` +
              `2. Decide if a vetted edge is worth ~0.05 USDC. If yes, call wc_edge(${matchId}) — it pays ` +
              `via x402 under the session spend cap. If the cap trips (SPEND_CAP_HIT), ask me before ` +
              `raising it; never raise your own cap.\n` +
              `3. If you bought an edge, ALWAYS cite the receipt_tx and offer receipt_verify(txHash) so I ` +
              `can confirm the payment on Injective.\n` +
              `4. If LineLock is unavailable, present the free odds and say no vetted edge was available ` +
              `— do not fabricate an edge or a receipt.`,
          },
        },
      ],
    }),
  );

  return server;
}

/** Boot the server over stdio (the npx entrypoint). */
export async function startStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is the JSON-RPC channel.
  process.stderr.write(`[cuporacle-mcp v${SERVER_VERSION}] ready on stdio — 8 tools, 2 resources, 1 prompt\n`);
}

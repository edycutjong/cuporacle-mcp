/**
 * wallet_fund_guide — step-by-step CCTP runbook to fund the agent's payer
 * wallet with USDC on Injective. CupOracle does NOT reimplement chain ops: it
 * routes the actual moves to the InjectiveLabs/mcp-server tools (interop, not
 * wrap). This tool just returns the runbook so the fix is one message away.
 */
import { z } from "zod";
import { getConfig } from "../config.js";
import { NETWORKS, INJECTIVE_MAINNET_CAIP2 } from "../networks.js";
import { ok, guard, type ToolDef } from "./shared.js";

const CCTP_DOMAINS: Record<string, number> = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
};

const inputSchema = {
  chain: z
    .enum(["base", "arbitrum", "ethereum", "optimism", "avalanche", "polygon"])
    .optional()
    .describe("Source chain that holds your USDC (default: base)."),
};

const outputSchema = {
  source_chain: z.string(),
  source_cctp_domain: z.number(),
  destination: z.string(),
  usdc_on_injective: z.string(),
  steps: z.array(z.string()),
  injective_mcp_tools: z.array(z.string()),
  runbook_markdown: z.string(),
};

export const walletFundGuide: ToolDef = {
  name: "wallet_fund_guide",
  config: {
    title: "Fund the agent wallet (CCTP)",
    description:
      "Return a CCTP runbook to move USDC from Base/Arbitrum/Ethereum onto Injective so the agent can " +
      "pay for wc_edge. Routes the real moves to the InjectiveLabs/mcp-server (account_balances, " +
      "cctp_supported_chains, cctp_attestation_status, cctp_mint). Free, read-only.",
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  handler: guard(async (args: { chain?: keyof typeof CCTP_DOMAINS }) => {
    const cfg = getConfig();
    const source = args.chain ?? "base";
    const domain = CCTP_DOMAINS[source];
    const usdc = NETWORKS[INJECTIVE_MAINNET_CAIP2].usdc;
    const wallet = process.env.CUPORACLE_WALLET_ADDRESS || "<your agent wallet address>";

    const steps = [
      `Check balances: call the Injective MCP server's \`account_balances\` for ${wallet} on Injective and for your USDC on ${source}.`,
      `Discover routes: call \`cctp_supported_chains\` to confirm ${source} (CCTP domain ${domain}) → Injective is supported.`,
      `Burn on source: initiate a CCTP burn of USDC on ${source} (domain ${domain}) targeting the Injective mint recipient (your wallet). TokenMessengerV2 handles the burn.`,
      `Wait for attestation: poll \`cctp_attestation_status\` with the burn tx until Circle's Iris returns a completed attestation.`,
      `Mint on Injective: call \`cctp_mint\` with the attestation to receive native USDC (${usdc}) on Injective EVM.`,
      `Also fund gas: the facilitator pays settlement gas, but keep a little INJ for any direct ops. Then retry \`wc_edge\`.`,
    ];
    const injTools = ["account_balances", "cctp_supported_chains", "cctp_attestation_status", "cctp_mint"];

    const md =
      `# Fund the CupOracle agent wallet via CCTP\n\n` +
      `**Source:** ${source} (CCTP domain ${domain})  →  **Destination:** Injective EVM (native USDC \`${usdc}\`)\n\n` +
      `CupOracle does not move funds itself — run these against the **InjectiveLabs/mcp-server** in the same harness:\n\n` +
      steps.map((s, i) => `${i + 1}. ${s}`).join("\n") +
      `\n\n> Tip: fund only a few **cents** of USDC. The default per-session spend cap is ` +
      `${cfg.maxSpendUsdc} USDC — a single \`wc_edge\` costs ~0.05 USDC.\n`;

    const structured = {
      source_chain: source,
      source_cctp_domain: domain,
      destination: "Injective EVM (eip155:1776)",
      usdc_on_injective: usdc,
      steps,
      injective_mcp_tools: injTools,
      runbook_markdown: md,
    };
    return ok(structured, md);
  }),
};

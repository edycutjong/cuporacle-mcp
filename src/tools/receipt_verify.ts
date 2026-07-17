/**
 * receipt_verify — verify an x402 payment receipt on Injective EVM.
 *
 * Reads the transaction receipt + block over the EVM RPC (no key needed),
 * decodes the USDC ERC-20 Transfer log, and returns block time / amount /
 * payee with an explorer link. This is how a judge confirms a wc_edge receipt
 * is real without paying anything.
 */
import { z } from "zod";
import { createPublicClient, http, parseAbiItem, decodeEventLog, getAddress } from "viem";
import { getConfig } from "../config.js";
import { getNetworkMeta, explorerTxUrl, unitsToUsdc, NETWORKS } from "../networks.js";
import { CupOracleError } from "../errors.js";
import { getViemChain, type InjectiveNetwork } from "@injectivelabs/x402/networks";
import { ok, guard, type ToolDef } from "./shared.js";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const inputSchema = {
  txHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "txHash must be a 32-byte 0x hex string")
    .describe("The receipt transaction hash to verify."),
  network: z
    .enum(["eip155:1776", "eip155:1439"])
    .optional()
    .describe("CAIP-2 network (default eip155:1776 mainnet)."),
};

const outputSchema = {
  ok: z.boolean(),
  txHash: z.string(),
  network: z.string(),
  status: z.string(),
  block_number: z.number().nullable(),
  block_time: z.string().nullable(),
  amount_usdc: z.number().nullable(),
  payer: z.string().nullable(),
  payee: z.string().nullable(),
  asset: z.string().nullable(),
  explorer_url: z.string(),
};

export const receiptVerify: ToolDef = {
  name: "receipt_verify",
  config: {
    title: "Verify payment receipt",
    description:
      "Verify an x402 USDC payment receipt on Injective EVM: reads the tx over RPC, decodes the USDC " +
      "transfer, and returns block time, amount, payer and payee with an explorer link. Free.",
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  handler: guard(async (args: { txHash: string; network?: InjectiveNetwork }) => {
    const cfg = getConfig();
    const net = (args.network ?? cfg.network) as InjectiveNetwork;
    const meta = getNetworkMeta(net);
    if (!meta) {
      throw new CupOracleError("INVALID_INPUT", `Unknown network ${net}.`);
    }
    const chain = getViemChain(net);
    const client = createPublicClient({ chain, transport: http(cfg.rpcUrl ?? meta.rpcUrl) });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: args.txHash as `0x${string}` });
    } catch {
      throw new CupOracleError("RECEIPT_NOT_FOUND", `No transaction ${args.txHash} on ${meta.name}.`, {
        hint: "The tx may be on the other network, not yet mined, or fabricated. Check the explorer link.",
        details: { explorer_url: explorerTxUrl(net, args.txHash) },
      });
    }

    let blockTime: string | null = null;
    try {
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      blockTime = new Date(Number(block.timestamp) * 1000).toISOString();
    } catch {
      blockTime = null;
    }

    // Decode the USDC Transfer log (the payment leg).
    const usdc = NETWORKS[net].usdc.toLowerCase();
    let amountUsdc: number | null = null;
    let payer: string | null = null;
    let payee: string | null = null;
    let asset: string | null = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdc) continue;
      try {
        const decoded = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
        if (decoded.eventName === "Transfer") {
          const a = decoded.args as { from: string; to: string; value: bigint };
          amountUsdc = unitsToUsdc(a.value);
          payer = getAddress(a.from);
          payee = getAddress(a.to);
          asset = getAddress(log.address);
          break;
        }
      } catch {
        /* not a Transfer log */
      }
    }

    const okStatus = receipt.status === "success";
    const structured = {
      ok: okStatus && amountUsdc != null,
      txHash: args.txHash,
      network: net,
      status: receipt.status,
      block_number: Number(receipt.blockNumber),
      block_time: blockTime,
      amount_usdc: amountUsdc,
      payer,
      payee,
      asset,
      explorer_url: explorerTxUrl(net, args.txHash),
    };
    const summary =
      `Receipt ${okStatus ? "OK" : "reverted"} on ${meta.name}\n` +
      `  amount: ${amountUsdc != null ? amountUsdc + " USDC" : "n/a (no USDC transfer log)"}\n` +
      `  payer:  ${payer ?? "n/a"}\n  payee:  ${payee ?? "n/a"}\n` +
      `  block:  ${structured.block_number} @ ${blockTime ?? "?"}\n  ${structured.explorer_url}`;
    return ok(structured, summary);
  }),
};

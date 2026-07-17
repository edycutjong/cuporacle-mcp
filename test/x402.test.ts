import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parsePaymentRequiredBody,
  chooseRequirement,
  quoteFromPaymentRequired,
  quoteFromResponse,
  signQuote,
  paidFetch,
} from "../src/x402/client.js";
import { parsePaymentResponseHeader, encodePaymentSignatureHeader, decodePaymentSignatureHeader } from "@injectivelabs/x402/client";
import { generateWallet } from "../src/keystore/keystore.js";
import { CupOracleError } from "../src/errors.js";

const FIX = resolve(__dirname, "../fixtures");
const recordedQuote = JSON.parse(readFileSync(resolve(FIX, "edge-402-quote.json"), "utf-8"));
const edgeSuccess = JSON.parse(readFileSync(resolve(FIX, "edge-success.json"), "utf-8"));

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

describe("402 quote parsing (recorded fixture)", () => {
  it("validates the recorded quote against the x402 PaymentRequired schema", () => {
    const pr = parsePaymentRequiredBody(recordedQuote);
    expect(pr.x402Version).toBe(2);
    expect(pr.accepts.length).toBeGreaterThan(0);
  });

  it("chooses the Injective mainnet requirement", () => {
    const pr = parsePaymentRequiredBody(recordedQuote);
    const req = chooseRequirement(pr.accepts)!;
    expect(req.network).toBe("eip155:1776");
    expect(req.scheme).toBe("exact");
  });

  it("extracts a 0.05 USDC quote with the correct asset and payTo", () => {
    const pr = parsePaymentRequiredBody(recordedQuote);
    const q = quoteFromPaymentRequired(pr);
    expect(q.amount).toBe("50000");
    expect(q.amountUsdc).toBeCloseTo(0.05, 6);
    expect(q.asset.toLowerCase()).toBe("0xa00c59ff5a080d2b954d0c75e46e22a0c371235a");
    expect(q.payTo).toBe("0x45078eD96C2bB171009A47a57aF5C085Bf4fD0e3");
  });

  it("reads requirements from a 402 Response JSON body", async () => {
    const res = new Response(JSON.stringify(recordedQuote), {
      status: 402,
      headers: { "content-type": "application/json" },
    });
    const q = await quoteFromResponse(res);
    expect(q.amountUsdc).toBeCloseTo(0.05, 6);
  });

  it("falls back to the legacy base64 PAYMENT-REQUIRED header", async () => {
    const res = new Response("not json", {
      status: 402,
      headers: { "PAYMENT-REQUIRED": b64(recordedQuote) },
    });
    const q = await quoteFromResponse(res);
    expect(q.network).toBe("eip155:1776");
  });

  it("rejects a quote with no supported Injective network", () => {
    const bad = { ...recordedQuote, accepts: [{ ...recordedQuote.accepts[0], network: "eip155:1" }] };
    const pr = parsePaymentRequiredBody(bad);
    expect(() => quoteFromPaymentRequired(pr)).toThrow(CupOracleError);
  });
});

describe("EIP-3009 signing (offline, no funds)", () => {
  it("signs the recorded quote and produces a decodable PAYMENT-SIGNATURE payload", async () => {
    const { privateKey, address } = generateWallet();
    const pr = parsePaymentRequiredBody(recordedQuote);
    const q = quoteFromPaymentRequired(pr);
    const { payload, header } = await signQuote(privateKey, q);

    expect(payload.x402Version).toBe(2);
    expect(payload.payload.authorization.from.toLowerCase()).toBe(address.toLowerCase());
    expect(payload.payload.authorization.to).toBe(q.payTo);
    expect(payload.payload.authorization.value).toBe("50000");
    expect(payload.payload.signature).toMatch(/^0x[0-9a-f]+$/i);

    // header round-trips through the library's own codec
    const decoded = decodePaymentSignatureHeader(header);
    expect(decoded.payload.authorization.value).toBe("50000");
    expect(header).toBe(encodePaymentSignatureHeader(payload));
  });
});

describe("PAYMENT-RESPONSE receipt parsing", () => {
  it("decodes the receipt tx hash from a PAYMENT-RESPONSE header", () => {
    const receipt = edgeSuccess.payment_response_header;
    const res = new Response("{}", { status: 200, headers: { "PAYMENT-RESPONSE": b64(receipt) } });
    const parsed = parsePaymentResponseHeader(res);
    expect(parsed?.success).toBe(true);
    expect(parsed?.transaction).toBe(receipt.transaction);
    expect(parsed?.network).toBe("eip155:1776");
  });

  it("returns undefined when no receipt header is present", () => {
    const res = new Response("{}", { status: 200 });
    expect(parsePaymentResponseHeader(res)).toBeUndefined();
  });
});

describe("paidFetch full handshake (stubbed transport, no chain)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs 402 → spend-gate → sign → retry → receipt end-to-end", async () => {
    const { privateKey } = generateWallet();
    const receipt = { success: true, transaction: "0xfeed", network: "eip155:1776", payer: "0x1" };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(recordedQuote), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(edgeSuccess.edge), {
          status: 200,
          headers: { "content-type": "application/json", "PAYMENT-RESPONSE": b64(receipt) },
        }),
      );

    let gateSawQuote = false;
    const result = await paidFetch(
      "https://edge.example/api/edge",
      { method: "POST", body: "{}" },
      privateKey,
      (q) => {
        gateSawQuote = q.amountUsdc === 0.05;
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(gateSawQuote).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.receipt?.transaction).toBe("0xfeed");
    expect((result.body as { fixture: string }).fixture).toBe("France vs Spain");

    // the retry carried a PAYMENT-SIGNATURE header
    const retryInit = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = new Headers(retryInit.headers);
    expect(headers.get("PAYMENT-SIGNATURE")).toBeTruthy();
  });

  it("aborts before paying when the spend gate throws", async () => {
    const { privateKey } = generateWallet();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(recordedQuote), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      paidFetch("https://edge.example/api/edge", { method: "POST" }, privateKey, () => {
        throw new CupOracleError("SPEND_CAP_HIT", "over cap");
      }),
    ).rejects.toThrow("over cap");
    // only the first (unpaid) request happened; no retry/payment
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps an unreachable upstream to UPSTREAM_UNAVAILABLE", async () => {
    const { privateKey } = generateWallet();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      paidFetch("https://down.example/api/edge", {}, privateKey, () => {}),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
});

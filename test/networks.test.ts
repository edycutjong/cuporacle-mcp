import { describe, it, expect } from "vitest";
import {
  usdcToUnits,
  unitsToUsdc,
  explorerTxUrl,
  getNetworkMeta,
  NETWORKS,
  INJECTIVE_MAINNET_CAIP2,
  INJECTIVE_TESTNET_CAIP2,
} from "../src/networks.js";

describe("USDC unit conversion", () => {
  it("converts 0.05 USDC to 50000 smallest units", () => {
    expect(usdcToUnits("0.05")).toBe(50000n);
  });
  it("converts 1 USDC to 1000000 units", () => {
    expect(usdcToUnits(1)).toBe(1_000_000n);
  });
  it("round-trips units back to decimal USDC", () => {
    expect(unitsToUsdc(50000n)).toBeCloseTo(0.05, 6);
    expect(unitsToUsdc("1000000")).toBe(1);
  });
  it("handles sub-cent amounts without float drift", () => {
    expect(usdcToUnits("0.123456")).toBe(123456n);
  });
});

describe("network metadata", () => {
  it("knows mainnet chain id 1776 and mainnet USDC", () => {
    const m = getNetworkMeta(INJECTIVE_MAINNET_CAIP2)!;
    expect(m.chainId).toBe(1776);
    expect(m.usdc.toLowerCase()).toBe("0xa00c59ff5a080d2b954d0c75e46e22a0c371235a");
  });
  it("knows testnet chain id 1439", () => {
    expect(NETWORKS[INJECTIVE_TESTNET_CAIP2].chainId).toBe(1439);
  });
  it("builds an explorer tx url on Blockscout", () => {
    const url = explorerTxUrl(INJECTIVE_MAINNET_CAIP2, "0xabc");
    expect(url).toBe("https://blockscout.injective.network/tx/0xabc");
  });
});

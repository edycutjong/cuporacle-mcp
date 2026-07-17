import { describe, it, expect } from "vitest";
import { encryptKey, decryptKey, generateWallet } from "../src/keystore/keystore.js";

describe("AES-256-GCM keystore", () => {
  it("generates a valid wallet with a derivable address", () => {
    const w = generateWallet();
    expect(w.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("round-trips a private key through encrypt/decrypt", () => {
    const { privateKey } = generateWallet();
    const store = encryptKey(privateKey, "correct horse battery staple");
    expect(store.cipher).toBe("aes-256-gcm");
    expect(store.ciphertext).not.toContain(privateKey.slice(2));
    expect(decryptKey(store, "correct horse battery staple")).toBe(privateKey);
  });

  it("fails to decrypt with the wrong password", () => {
    const { privateKey } = generateWallet();
    const store = encryptKey(privateKey, "right-password");
    expect(() => decryptKey(store, "wrong-password")).toThrow();
  });

  it("records the wallet address in the keystore header", () => {
    const { privateKey, address } = generateWallet();
    const store = encryptKey(privateKey, "pw");
    expect(store.address.toLowerCase()).toBe(address.toLowerCase());
  });
});

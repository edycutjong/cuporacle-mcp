/**
 * AES-256-GCM keystore for the agent's x402 payer key.
 *
 * Same shape as the InjectiveLabs/mcp-server pattern: a scrypt-derived key
 * encrypts the private key at rest. In practice most harnesses pass the key via
 * env (CUPORACLE_PRIVATE_KEY); the keystore + `init` scaffold exist so a fresh
 * machine can generate and hold a key without ever pasting a seed.
 */
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

export interface KeystoreFile {
  version: 1;
  cipher: "aes-256-gcm";
  kdf: "scrypt";
  address: `0x${string}`;
  salt: string; // hex
  iv: string; // hex
  tag: string; // hex
  ciphertext: string; // hex
  createdAt: string;
}

const SCRYPT_N = 16384;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: SCRYPT_N });
}

/** Encrypt a 0x private key into a keystore object. */
export function encryptKey(privateKey: `0x${string}`, password: string): KeystoreFile {
  const address = privateKeyToAccount(privateKey).address;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    address,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
    createdAt: new Date().toISOString(),
  };
}

/** Decrypt a keystore object back to the 0x private key. Throws on bad password. */
export function decryptKey(store: KeystoreFile, password: string): `0x${string}` {
  const key = deriveKey(password, Buffer.from(store.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(store.iv, "hex"));
  decipher.setAuthTag(Buffer.from(store.tag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(store.ciphertext, "hex")),
    decipher.final(),
  ]).toString("utf8");
  return plaintext as `0x${string}`;
}

export function saveKeystore(path: string, store: KeystoreFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function loadKeystore(path: string): KeystoreFile | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8")) as KeystoreFile;
}

/** Generate a fresh random payer wallet. */
export function generateWallet(): { privateKey: `0x${string}`; address: `0x${string}` } {
  const privateKey = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  const address = privateKeyToAccount(privateKey).address;
  return { privateKey, address };
}

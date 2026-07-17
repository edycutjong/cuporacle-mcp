/**
 * Global test setup: isolate the receipt store + keystore under a temp
 * CUPORACLE_HOME so tests never write to the real ~/.cuporacle.
 */
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

process.env.CUPORACLE_HOME = mkdtempSync(resolve(tmpdir(), "cuporacle-test-"));

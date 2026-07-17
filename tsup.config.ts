import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    "bin/cuporacle-mcp": "bin/cuporacle-mcp.ts",
  },
  format: ["esm"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  // Keep runtime deps external so the published package resolves them from node_modules.
  external: ["@modelcontextprotocol/sdk", "@injectivelabs/x402", "viem", "zod"],
});

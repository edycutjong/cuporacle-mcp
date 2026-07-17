import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 15000,
    // Network-touching tests are opt-in via CUPORACLE_LIVE=1 so the suite is
    // deterministic and offline by default (data comes from committed fixtures).
  },
});

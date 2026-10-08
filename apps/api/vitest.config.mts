import { defineConfig } from "vitest/config";

import { testEnv } from "./test/env.mjs";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    env: testEnv,
    // The test files share one database.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});

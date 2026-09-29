import { defineConfig } from "tsup";

// Compiles each fixture MCP server from fixtures/<name>/src/index.ts to
// fixtures/<name>/dist/index.js so integration tests and manual smoke runs
// can spawn them with `node fixtures/<name>/dist/index.js`.
export default defineConfig({
  entry: {
    "valid-server/dist/index": "fixtures/valid-server/src/index.ts",
    "minimal-server/dist/index": "fixtures/minimal-server/src/index.ts",
    "broken-server/dist/index": "fixtures/broken-server/src/index.ts",
    "slow-server/dist/index": "fixtures/slow-server/src/index.ts",
    "noisy-server/dist/index": "fixtures/noisy-server/src/index.ts",
    "invalid-server/dist/index": "fixtures/invalid-server/src/index.ts",
    "warn-only-server/dist/index": "fixtures/warn-only-server/src/index.ts",
    "env-echo-server/dist/index": "fixtures/env-echo-server/src/index.ts",
    "http-server/dist/index": "fixtures/http-server/src/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "fixtures",
  clean: false,
  sourcemap: false,
  splitting: false,
  dts: false,
  minify: false,
  shims: false,
});

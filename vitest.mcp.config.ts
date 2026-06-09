import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src/renderer"),
    },
  },
  test: {
    environment: "node",
    include: ["src/mcp/server.smoke.test.ts"],
    testTimeout: 60_000,
  },
});

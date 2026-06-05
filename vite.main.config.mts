import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native (N-API) module: load from node_modules at runtime, don't bundle.
      external: ["@libsql/client"],
    },
  },
});

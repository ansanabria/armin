import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // better-sqlite3 loads a native .node addon that can't be bundled.
      external: ["better-sqlite3", "bindings"],
    },
  },
});

import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // libsql ships native binaries; ws optional peer deps break when bundled.
      external: [
        "libsql",
        "@libsql/client",
        "@libsql/isomorphic-ws",
        "ws",
        "bufferutil",
        "utf-8-validate",
      ],
    },
  },
});

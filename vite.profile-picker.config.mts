import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src/renderer"),
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "profile-picker.html"),
    },
  },
});

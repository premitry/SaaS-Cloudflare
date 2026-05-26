import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev: vite serves the UI on :5173 and proxies /api/* to the worker on :8787
// In prod: the same Cloudflare Worker serves both the UI (via [assets]) and /api/*
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    emptyOutDir: true,
  },
});

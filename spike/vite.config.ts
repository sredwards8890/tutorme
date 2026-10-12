import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { resolve } from "node:path";

// Multi-page build: each spike is its own HTML entry so the pages stay independent.
// `vite --mode https` serves with a self-signed certificate on port 5174 so iPad Safari
// gets a secure context (required for the microphone) while staying LAN-only.
// `vite build --mode pages` targets the GitHub Pages project site; the app owns the root,
// the spike lives under /tutorme/spike/.
export default defineConfig(({ mode }) => {
  const https = mode === "https";
  return {
    base: mode === "pages" ? "/tutorme/spike/" : "/",
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, "index.html"),
          pointer: resolve(import.meta.dirname, "pointer.html"),
          rtc: resolve(import.meta.dirname, "rtc.html"),
          board: resolve(import.meta.dirname, "board.html"),
        },
      },
    },
    server: { port: https ? 5174 : 5173, host: true },
  };
});

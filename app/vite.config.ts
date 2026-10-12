import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Modes:
//   (default)  plain http dev server on 5180
//   https      self-signed https on 5181 so iPad Safari grants the microphone on the LAN
//   pages      production build for the GitHub Pages project site at /tutorme/
export default defineConfig(({ mode }) => {
  const https = mode === "https";
  return {
    base: mode === "pages" ? "/tutorme/" : "/",
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: { port: https ? 5181 : 5180, host: true },
  };
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The CSP is only injected as a <meta> tag in builds. In dev, Vite (HMR) relies on
// inline scripts and ws://localhost, so a CSP would break development mode.
// - style 'unsafe-inline': for React's style attribute and the styles xterm injects
// - data: for img/font: Vite inlines small assets as data URIs
// - connect 'self' only: all remote traffic (firmware downloads etc.) goes through main
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
].join("; ");

const injectCsp = () => ({
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
        return {
            html,
            tags: [
                {
                    tag: "meta",
                    attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
                    injectTo: "head-prepend",
                },
            ],
        };
    },
});

export default defineConfig({
  root: "renderer",
  plugins: [react(), injectCsp()],
  server: {
    host: true,
    port: 5173,
  },
  base: "./",
  build: {
    outDir: "../dist",
    // outDir sits outside the vite root, so vite refuses to clear it on its own. Without this
    // every build's hashed assets pile up in dist/ and electron-builder packs the lot of them.
    emptyOutDir: true,
  },
});

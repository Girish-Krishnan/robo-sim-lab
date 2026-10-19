import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

const githubPages = process.env.GITHUB_PAGES === "true";
const base = githubPages ? "/robo-sim-lab/" : "/";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/**
 * GitHub Pages cannot set COOP/COEP. Copy coi-serviceworker next to the
 * built index and load it so the page reloads once under cross-origin
 * isolation. Cloudflare Pages uses public/_headers instead, so the
 * service worker is not injected there (or in local dev).
 */
function githubPagesCoi(): Plugin {
  return {
    name: "github-pages-coi",
    apply: "build",
    transformIndexHtml(html) {
      if (!githubPages) return html;
      return html.replace(
        "<head>",
        `<head>\n    <script src="${base}coi-serviceworker.js"></script>`,
      );
    },
    generateBundle() {
      if (!githubPages) return;
      const source = readFileSync(
        resolve("node_modules/coi-serviceworker/coi-serviceworker.js"),
      );
      this.emitFile({
        type: "asset",
        fileName: "coi-serviceworker.js",
        source,
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [githubPagesCoi()],
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  optimizeDeps: {
    exclude: ["pyodide"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

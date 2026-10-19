import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy the Pyodide runtime that ships with the npm package into public/pyodide,
 * and download the NumPy wheel next to it. The site then serves both same-origin,
 * so COEP require-corp (Cloudflare headers or the GitHub Pages service worker)
 * does not have to trust a third-party CDN at runtime.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "pyodide");
const dest = path.join(root, "public", "pyodide");
const runtimeFiles = [
  "pyodide.mjs",
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

if (!existsSync(path.join(source, "pyodide-lock.json"))) {
  throw new Error("pyodide is not installed. Run npm install first.");
}

mkdirSync(dest, { recursive: true });
for (const file of runtimeFiles) {
  copyFileSync(path.join(source, file), path.join(dest, file));
}

const pkg = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(dest, "pyodide-lock.json"), "utf8"));
const numpy = lock.packages?.numpy;
if (!numpy?.file_name || !numpy.sha256) {
  throw new Error("pyodide-lock.json has no numpy entry.");
}

const wheelPath = path.join(dest, numpy.file_name);
if (!existsSync(wheelPath) || sha256(wheelPath) !== numpy.sha256) {
  const url = `https://cdn.jsdelivr.net/pyodide/v${pkg.version}/full/${numpy.file_name}`;
  process.stdout.write(`Downloading ${numpy.file_name}…\n`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download NumPy (${response.status}) from ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== numpy.sha256) {
    throw new Error(`NumPy checksum mismatch: ${digest} !== ${numpy.sha256}`);
  }
  writeFileSync(wheelPath, bytes);
}

process.stdout.write(`Pyodide ${pkg.version} runtime is in public/pyodide (NumPy included).\n`);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

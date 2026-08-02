#!/usr/bin/env node
// Bare-stack dev server: no bundler means no bundler dev server either.
// Serves the repo root over plain HTTP so relative asset paths behave the
// same as they will on GitHub Pages. No live reload — refresh after saving.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = process.env.PORT ?? 5173;
const ROOT = process.argv.includes("--dist") ? join(process.cwd(), "dist") : process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";

  let filePath = join(ROOT, path);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(ROOT, path, "index.html");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`404: ${path} not found`);
    return;
  }

  res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}).listen(PORT, () => {
  console.log(`dev server: http://localhost:${PORT}/`);
});

#!/usr/bin/env node
// Bare-stack build: no bundler, no transpilation. Every shipped file is
// hand-written, so "build" just copies the site source into dist/ verbatim.
// Mirrors the template's original Vite convention (every top-level .html
// file is a page) so adding a page later still needs no config here.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { extname, join } from "node:path";

const DIST = "dist";
const SKIP_DIRS = new Set(["node_modules", "dist", "spec", "scripts", "reflections"]);
const SKIP_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "mise.toml",
]);
const SHIP_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".mp3",
  ".mp4",
  ".webm",
]);

function siteFiles(dir = ".") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : siteFiles(path);
    if (SKIP_FILES.has(entry.name)) return [];
    return SHIP_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const files = siteFiles();
for (const file of files) {
  const dest = join(DIST, file);
  mkdirSync(join(dest, ".."), { recursive: true });
  cpSync(file, dest);
}

console.log(`built ${files.length} file(s) into ${DIST}/`);

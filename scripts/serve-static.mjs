#!/usr/bin/env node
/**
 * Serves out-static the way GitHub Pages does (folder → index.html, missing → 404.html, gzip) for the
 * Playwright tests and local checks.   node scripts/serve-static.mjs [dir=out-static] [port=4173]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(process.argv[2] ?? "out-static");
const port = Number(process.argv[3] ?? 4173);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".mp4": "video/mp4" };

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    let file = path.join(root, rel);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!rel.endsWith("/")) return res.writeHead(301, { Location: `${rel}/${url.search}` }).end();
      file = path.join(file, "index.html");
    }
    let status = 200;
    if (!existsSync(file)) [file, status] = [path.join(root, "404.html"), 404];
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    let body = readFileSync(file);
    const headers = { "Content-Type": type, "Cache-Control": "max-age=600" };
    if (/text|javascript|json|xml|svg|manifest/.test(type) && /gzip/.test(req.headers["accept-encoding"] ?? "")) {
      body = zlib.gzipSync(body);
      headers["Content-Encoding"] = "gzip";
    }
    res.writeHead(status, headers).end(req.method === "HEAD" ? undefined : body);
  })
  .listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));

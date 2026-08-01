#!/usr/bin/env node

import { hash } from "blake3-wasm";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const directory = resolve(process.argv[2] || ".pages-deploy");
const manifestPath = resolve(process.argv[3] || ".wrangler/pages-manifest.json");
const jwt = process.env.CF_PAGES_UPLOAD_JWT;
if (!jwt) throw new Error("CF_PAGES_UPLOAD_JWT is required.");

const mimeTypes = new Map(Object.entries({
  ".css": "text/css", ".html": "text/html", ".ico": "image/x-icon", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".txt": "text/plain", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2",
}));
const files = [];

async function walk(current) {
  for (const name of await readdir(current)) {
    const path = resolve(current, name);
    const info = await stat(path);
    const relativeName = relative(directory, path).split(sep).join("/");
    if (relativeName === "_worker.js" || relativeName === "_headers" || relativeName === "_redirects" || relativeName === "_routes.json") continue;
    if (info.isDirectory()) await walk(path);
    else {
      const content = await readFile(path);
      const extension = extname(path).slice(1);
      files.push({
        name: relativeName,
        path,
        content,
        contentType: mimeTypes.get(extname(path).toLowerCase()) || "application/octet-stream",
        hash: hash(content.toString("base64") + extension).toString("hex").slice(0, 32),
      });
    }
  }
}

async function api(path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.errors?.map((item) => item.message).join("; ") || `Cloudflare asset request failed (${response.status}).`);
  return payload.result;
}

await walk(directory);
const missing = new Set(await api("/pages/assets/check-missing", { hashes: files.map((file) => file.hash) }));
const pending = files.filter((file) => missing.has(file.hash));
const batches = [];
let batch = [];
let batchBytes = 0;
for (const file of pending.sort((left, right) => right.content.length - left.content.length)) {
  if (batch.length >= 100 || batchBytes + file.content.length > 18_000_000) {
    batches.push(batch);
    batch = [];
    batchBytes = 0;
  }
  batch.push(file);
  batchBytes += file.content.length;
}
if (batch.length) batches.push(batch);
for (const items of batches) {
  await api("/pages/assets/upload", items.map((file) => ({
    key: file.hash,
    value: file.content.toString("base64"),
    metadata: { contentType: file.contentType },
    base64: true,
  })));
}
await api("/pages/assets/upsert-hashes", { hashes: files.map((file) => file.hash) });
const manifest = Object.fromEntries(files.map((file) => [`/${file.name}`, file.hash]));
await writeFile(manifestPath, JSON.stringify(manifest));
console.log(`Uploaded ${pending.length}/${files.length} static assets.`);

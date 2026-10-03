#!/usr/bin/env node

import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const client = resolve(root, "dist", "client");
const server = resolve(root, "dist", "server");
const output = resolve(root, ".pages-deploy");
const pagesWorker = resolve(root, "cloudflare", "pages-worker.ts");
const vinextDeployRedirect = resolve(root, ".wrangler", "deploy", "config.json");

if (!output.startsWith(`${root}\\`) && !output.startsWith(`${root}/`)) {
  throw new Error("Pages staging path escaped the project root.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(client, output, { recursive: true });
const serverModule = await import(`${pathToFileURL(resolve(server, "index.js")).href}?pages=${Date.now()}`);
const rendered = await serverModule.default.fetch(
  new Request("https://taiwu-mugongjin.pages.dev/", { headers: { accept: "text/html", host: "taiwu-mugongjin.pages.dev", "x-forwarded-proto": "https" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);
if (!rendered.ok) throw new Error(`Static page render failed with ${rendered.status}.`);
await writeFile(resolve(output, "index.html"), await rendered.text());
await build({
  entryPoints: [pagesWorker],
  outfile: resolve(output, "_worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  target: "es2022",
});

// vinext writes a redirect for its SSR Worker build. This project deploys the
// dedicated Pages Worker above, so leaving that redirect makes Wrangler merge
// the D1 binding twice and abort before uploading anything.
await rm(vinextDeployRedirect, { force: true });

console.log(`Cloudflare Pages staging ready: ${output}`);

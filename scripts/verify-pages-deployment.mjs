#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_URL = "https://taiwu-mugongjin.pages.dev";

const checks = [
  { path: "/api/reports", status: 200, key: "reports" },
  { path: "/api/strategies", status: 200, key: "strategies" },
  { path: "/api/not-a-route", status: 404, key: "error" },
];

function wait(milliseconds) {
  return new Promise((done) => setTimeout(done, milliseconds));
}

async function verifyOnce(baseUrl, fetchImpl, attempt) {
  const results = [];
  for (const check of checks) {
    const url = new URL(check.path, `${baseUrl}/`);
    url.searchParams.set("__deploy_check", `${Date.now()}-${attempt}`);
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`${check.path} returned ${contentType || "no content type"}; expected application/json (HTTP ${response.status}).`);
    }
    if (response.status !== check.status) {
      throw new Error(`${check.path} returned HTTP ${response.status}; expected ${check.status}.`);
    }
    const body = await response.json();
    if (check.key === "error" ? typeof body.error !== "string" : !Array.isArray(body[check.key])) {
      throw new Error(`${check.path} returned JSON without a valid ${check.key} field.`);
    }
    results.push(`${check.path} ${response.status} JSON`);
  }

  const home = new URL("/", `${baseUrl}/`);
  home.searchParams.set("__deploy_check", `${Date.now()}-${attempt}`);
  const response = await fetchImpl(home, {
    headers: { accept: "text/html", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const html = await response.text();
  if (response.status !== 200 || !contentType.includes("text/html") || !html.includes("태오회권 무공진")) {
    throw new Error(`/ did not return the expected planner HTML (HTTP ${response.status}, ${contentType || "no content type"}).`);
  }
  results.push(`/ ${response.status} HTML`);
  return results;
}

export async function verifyDeployment({
  baseUrl = DEFAULT_URL,
  fetchImpl = globalThis.fetch,
  attempts = 10,
  delayMs = 1_500,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const normalizedUrl = new URL(baseUrl).origin;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyOnce(normalizedUrl, fetchImpl, attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(delayMs);
    }
  }
  throw new Error(`Deployment verification failed after ${attempts} attempt(s): ${lastError?.message || lastError}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const baseUrl = process.argv[2] || process.env.PAGES_URL || DEFAULT_URL;
  const results = await verifyDeployment({ baseUrl });
  console.log(`Cloudflare Pages verified: ${new URL(baseUrl).origin}`);
  for (const result of results) console.log(`  ${result}`);
}

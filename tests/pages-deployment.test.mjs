import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("Cloudflare Pages staging is static, small, and privacy-safe", async () => {
  const html = await readFile(new URL("../.pages-deploy/index.html", import.meta.url), "utf8");
  const workerUrl = new URL("../.pages-deploy/_worker.js", import.meta.url);
  const worker = await readFile(workerUrl, "utf8");
  const workerInfo = await stat(workerUrl);

  assert.match(html, /<title>태오회권 무공진<\/title>/i);
  assert.match(html, /구색옥선법/);
  assert.doesNotMatch(html, /[a-z0-9-]+\.chatgpt\.site/i);
  assert.ok(workerInfo.size < 25_000, `Pages Worker unexpectedly grew to ${workerInfo.size} bytes`);
  assert.match(worker, /strategy_builds/);
  assert.match(worker, /cf-connecting-ip/);
  assert.doesNotMatch(worker, /VOTE_HMAC_SECRET\s*[:=]\s*["'][^"']+["']/);
});

test("all six internal-energy schools keep their Korean names", async () => {
  const names = new Set();
  for (let shard = 0; shard < 8; shard += 1) {
    const skills = JSON.parse(await readFile(new URL(`../app/data/combat-skills-${shard}.json`, import.meta.url), "utf8"));
    for (const skill of skills) names.add(`${skill.element}:${skill.elementName}`);
  }
  assert.deepEqual([...names].sort(), ["0:금강", "1:자하", "2:현음", "3:순양", "4:귀원", "5:혼원"]);
});

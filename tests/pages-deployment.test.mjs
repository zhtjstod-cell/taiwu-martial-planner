import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { verifyDeployment } from "../scripts/verify-pages-deployment.mjs";

test("Pages deployment command uploads the Worker and then verifies API JSON", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const command = packageJson.scripts["pages:deploy"];
  assert.match(command, /build:pages/);
  assert.match(command, /wrangler pages deploy \.pages-deploy/);
  assert.match(command, /pages:verify/);
  assert.ok(command.indexOf("wrangler pages deploy") < command.indexOf("pages:verify"));
});

test("post-deploy verification rejects an HTML fallback on an API route", async () => {
  await assert.rejects(
    verifyDeployment({
      attempts: 1,
      fetchImpl: async () => new Response("<html>fallback</html>", { status: 200, headers: { "content-type": "text/html" } }),
    }),
    /expected application\/json/,
  );
});

test("post-deploy verification accepts the Worker API contract", async () => {
  const results = await verifyDeployment({
    attempts: 1,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (path === "/api/reports") return Response.json({ reports: [] });
      if (path === "/api/strategies") return Response.json({ strategies: [] });
      if (path === "/api/not-a-route") return Response.json({ error: "Not found" }, { status: 404 });
      return new Response("<!doctype html><title>태오회권 무공진</title>", { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  assert.equal(results.length, 4);
});

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
  assert.match(worker, /relation_reports/);
  assert.match(worker, /cf-connecting-ip/);
  assert.doesNotMatch(worker, /VOTE_HMAC_SECRET\s*[:=]\s*["'][^"']+["']/);
  await assert.rejects(stat(new URL("../.wrangler/deploy/config.json", import.meta.url)), { code: "ENOENT" });
});

test("Pages relation-report API validates evidence and stores only HMAC-scoped metadata", async () => {
  const workerUrl = new URL(`../.pages-deploy/_worker.js?reports=${process.pid}-${Date.now()}`, import.meta.url);
  const { default: worker } = await import(workerUrl.href);
  const calls = [];
  const db = {
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      const statement = {
        bind(...values) { call.values = values; return statement; },
        async first() { return /INSERT INTO relation_reports/.test(sql) ? { id: 7 } : null; },
        async all() {
          return { results: /FROM relation_reports/.test(sql) ? [{ id: 7, relation_type: "counter", subject_skill_id: 580, subject_mode: "direct", related_skill_id: 33, related_mode: "direct", dataset_version: "test", evidence: "봉금 저항으로 공법 차단을 막는다.", created_at: 1 }] : [] };
        },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  const env = { DB: db, VOTE_HMAC_SECRET: "test-secret", ASSETS: { fetch: async () => new Response("asset") } };
  const invalid = await worker.fetch(new Request("https://example.test/api/reports", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" }, body: JSON.stringify({ relationType: "counter", subjectSkillId: 580, subjectMode: "direct", relatedSkillId: 33, relatedMode: "direct", datasetVersion: "test", evidence: "짧음" }) }), env);
  assert.equal(invalid.status, 400);
  const created = await worker.fetch(new Request("https://example.test/api/reports", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" }, body: JSON.stringify({ relationType: "counter", subjectSkillId: 580, subjectMode: "direct", relatedSkillId: 33, relatedMode: "direct", datasetVersion: "test", evidence: "봉금 저항으로 공법 차단을 막는다." }) }), env);
  assert.equal(created.status, 201);
  const insert = calls.find((call) => /INSERT INTO relation_reports/.test(call.sql));
  assert.equal(insert.values.length, 8);
  assert.notEqual(insert.values[7], "192.0.2.1");
  const listed = await worker.fetch(new Request("https://example.test/api/reports"), env);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.reports[0].evidence, "봉금 저항으로 공법 차단을 막는다.");
});

test("strategy passwords are hashed and gate body editing and deletion", async () => {
  const workerUrl = new URL(`../.pages-deploy/_worker.js?strategy-auth=${process.pid}-${Date.now()}`, import.meta.url);
  const { default: worker } = await import(workerUrl.href);
  const calls = [];
  let passwordHash = null;
  let passwordSalt = null;
  const db = {
    prepare(sql) {
      const call = { sql, values: [] };
      calls.push(call);
      const statement = {
        bind(...values) { call.values = values; return statement; },
        async first() {
          if (/SELECT id FROM strategy_builds WHERE author_hash/.test(sql)) return null;
          if (/INSERT INTO strategy_builds/.test(sql)) {
            passwordHash = call.values[5];
            passwordSalt = call.values[6];
            return { id: 41 };
          }
          if (/SELECT password_hash, password_salt/.test(sql)) return { password_hash: passwordHash, password_salt: passwordSalt };
          return null;
        },
        async all() {
          if (!/FROM strategy_builds/.test(sql)) return { results: [] };
          return { results: [{ id: 41, title: "독 운용 공략", content: "독을 먼저 누적한 뒤 발작시키는 운용법입니다.", dataset_version: "test", plan_json: JSON.stringify({ equipped: [{ skillId: 1, mode: "direct", mastered: false }], genericAllocation: [0, 0, 0, 0], maxSlots: false }), created_at: 1, updated_at: 1, votes: 0 }] };
        },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  const env = { DB: db, VOTE_HMAC_SECRET: "test-secret", ASSETS: { fetch: async () => new Response("asset") } };
  const password = "correct-password-123";
  const plan = { equipped: [{ skillId: 1, mode: "direct", mastered: false }], genericAllocation: [0, 0, 0, 0], maxSlots: false };
  const created = await worker.fetch(new Request("https://example.test/api/strategies", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.20" }, body: JSON.stringify({ title: "독 운용 공략", content: "독을 먼저 누적한 뒤 발작시키는 운용법입니다.", password, datasetVersion: "test", plan }) }), env);
  assert.equal(created.status, 201);
  const insert = calls.find((call) => /INSERT INTO strategy_builds/.test(call.sql));
  assert.equal(insert.values.length, 8);
  assert.ok(!insert.values.includes(password));
  assert.match(passwordHash, /^pbkdf2-sha256\$100000\$[0-9a-f]{64}$/);
  assert.match(passwordSalt, /^[0-9a-f]{32}$/);

  const wrong = await worker.fetch(new Request("https://example.test/api/strategies/41", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "수정 제목", content: "수정된 공략 본문은 열 자를 넘깁니다.", password: "wrong-password-123" }) }), env);
  assert.equal(wrong.status, 403);
  assert.equal(calls.filter((call) => /UPDATE strategy_builds/.test(call.sql)).length, 0);

  const updated = await worker.fetch(new Request("https://example.test/api/strategies/41", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "수정 제목", content: "수정된 공략 본문은 열 자를 넘깁니다.", password }) }), env);
  assert.equal(updated.status, 200);
  assert.equal(calls.filter((call) => /UPDATE strategy_builds/.test(call.sql)).length, 1);

  const listed = await worker.fetch(new Request("https://example.test/api/strategies"), env);
  const listedBody = await listed.json();
  assert.equal(listedBody.strategies[0].content, "독을 먼저 누적한 뒤 발작시키는 운용법입니다.");
  assert.doesNotMatch(JSON.stringify(listedBody), /password|pbkdf2|correct-password/i);

  const deleted = await worker.fetch(new Request("https://example.test/api/strategies/41", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }), env);
  assert.equal(deleted.status, 200);
  assert.equal(calls.filter((call) => /DELETE FROM strategy_builds/.test(call.sql)).length, 1);
});

test("strategy body and password migration preserves legacy posts", async () => {
  const migration = await readFile(new URL("../drizzle/0002_swift_zzzax.sql", import.meta.url), "utf8");
  assert.match(migration, /ADD `content` text DEFAULT '' NOT NULL/);
  assert.match(migration, /ADD `password_hash` text/);
  assert.match(migration, /ADD `password_salt` text/);
  assert.match(migration, /ADD `updated_at` integer/);
  assert.doesNotMatch(migration, /UPDATE `?strategy_builds`?.*password/is);
});

test("all six internal-energy schools keep their Korean names", async () => {
  const names = new Set();
  for (let shard = 0; shard < 8; shard += 1) {
    const skills = JSON.parse(await readFile(new URL(`../app/data/combat-skills-${shard}.json`, import.meta.url), "utf8"));
    for (const skill of skills) names.add(`${skill.element}:${skill.elementName}`);
  }
  assert.deepEqual([...names].sort(), ["0:금강", "1:자하", "2:현음", "3:순양", "4:귀원", "5:혼원"]);
});

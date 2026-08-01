import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Taiwu planner", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>태오회권 무공진<\/title>/i);
  assert.match(html, /태오회권 무공진/);
  assert.match(html, /구색옥선법/);
  assert.match(html, /운공 배치/);
  assert.match(html, /만능공법칸/);
  assert.match(html, /데이터 업로드/);
  assert.match(html, /공략 게시판/);
  assert.match(html, /관계 제보/);
  assert.match(html, /품 분류/);
  assert.match(html, /고품 → 저품/);
  assert.match(html, /조건 없이 간단하게 최대 운공칸에 도달할 수 있습니다/);
  assert.match(html, /현재 프리셋 내보내기/);
  assert.match(html, /운공안 파일 가져오기/);
  assert.equal((html.match(/data-plan-index=/g) || []).length, 6);
  assert.match(html, /GitHub 추출기/);
  assert.match(html, /taiwu-martial-planner\/releases/);
  for (let element = 0; element <= 5; element += 1) assert.match(html, new RegExp(`skill-seal element-${element}`));
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

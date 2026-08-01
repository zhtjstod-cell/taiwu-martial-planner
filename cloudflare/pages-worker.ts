type PagesEnv = Cloudflare.Env & {
  ASSETS: Fetcher;
  VOTE_HMAC_SECRET: string;
};

type PublicPlan = {
  equipped: { skillId: number; mode: "direct" | "reverse"; mastered: boolean }[];
  genericAllocation: number[];
  maxSlots: boolean;
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function json(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), { ...init, headers: { ...jsonHeaders, ...init.headers } });
}

function validateTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (title.length < 2 || title.length > 32) throw new Error("제목은 2~32자로 입력해 주세요.");
  if (/[<>\u0000-\u001f]/.test(title) || /https?:\/\//i.test(title)) throw new Error("제목에 링크나 제어 문자를 넣을 수 없습니다.");
  return title;
}

function validatePlan(value: unknown): PublicPlan {
  const plan = value as Partial<PublicPlan>;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.equipped) || plan.equipped.length > 30) throw new Error("운공 조합 형식이 올바르지 않습니다.");
  const equipped = plan.equipped.map((entry) => {
    if (!Number.isInteger(entry?.skillId) || entry.skillId < 0 || entry.skillId > 100000 || !["direct", "reverse"].includes(entry.mode)) throw new Error("운공 조합의 무공 정보가 올바르지 않습니다.");
    return { skillId: entry.skillId, mode: entry.mode, mastered: Boolean(entry.mastered) };
  });
  const genericAllocation = Array.isArray(plan.genericAllocation)
    ? plan.genericAllocation.slice(0, 4).map((item) => Math.max(0, Math.min(9, Number(item) || 0)))
    : [0, 0, 0, 0];
  while (genericAllocation.length < 4) genericAllocation.push(0);
  return { equipped, genericAllocation, maxSlots: Boolean(plan.maxSlots) };
}

async function visitorHash(request: Request, secret: string) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateMode(value: unknown): "direct" | "reverse" {
  if (value !== "direct" && value !== "reverse") throw new Error("수련 방식이 올바르지 않습니다.");
  return value;
}

function validateSkillId(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 100000) throw new Error("공법 정보가 올바르지 않습니다.");
  return Number(value);
}

function validateEvidence(value: unknown) {
  const evidence = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (evidence.length < 10 || evidence.length > 500) throw new Error("근거는 10~500자로 입력해 주세요.");
  if (/[<>\u0000-\u001f]/.test(evidence) || /https?:\/\//i.test(evidence)) throw new Error("근거에 링크나 제어 문자를 넣을 수 없습니다.");
  return evidence;
}

async function listStrategies(env: PagesEnv) {
  const result = await env.DB.prepare(`
    SELECT b.id, b.title, b.dataset_version, b.plan_json, b.created_at, COUNT(v.id) AS votes
    FROM strategy_builds b
    LEFT JOIN strategy_votes v ON v.build_id = b.id
    GROUP BY b.id
    ORDER BY votes DESC, b.created_at DESC
    LIMIT 100
  `).all<{ id: number; title: string; dataset_version: string; plan_json: string; created_at: number; votes: number }>();
  return json({
    strategies: result.results.map((row) => ({
      id: row.id,
      title: row.title,
      datasetVersion: row.dataset_version,
      plan: JSON.parse(row.plan_json),
      createdAt: row.created_at,
      votes: Number(row.votes),
    })),
  }, { headers: { "cache-control": "public, max-age=15" } });
}

async function createStrategy(request: Request, env: PagesEnv) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 24_000) return json({ error: "요청이 너무 큽니다." }, { status: 413 });
  const body = await request.json() as { title?: unknown; datasetVersion?: unknown; plan?: unknown };
  const title = validateTitle(body.title);
  const plan = validatePlan(body.plan);
  if (!plan.equipped.length) throw new Error("무공을 하나 이상 배치해 주세요.");
  const datasetVersion = typeof body.datasetVersion === "string" ? body.datasetVersion.slice(0, 160) : "unknown";
  const authorHash = await visitorHash(request, env.VOTE_HMAC_SECRET);
  const cutoff = Math.floor(Date.now() / 1000) - 60;
  const recent = await env.DB.prepare("SELECT id FROM strategy_builds WHERE author_hash = ? AND created_at >= ? LIMIT 1").bind(authorHash, cutoff).first();
  if (recent) return json({ error: "공략 등록은 1분에 한 번만 가능합니다." }, { status: 429 });
  const result = await env.DB.prepare("INSERT INTO strategy_builds (title, dataset_version, plan_json, author_hash) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(title, datasetVersion, JSON.stringify(plan), authorHash)
    .first<{ id: number }>();
  return json({ id: result?.id }, { status: 201 });
}

async function vote(request: Request, env: PagesEnv, id: number) {
  const exists = await env.DB.prepare("SELECT id FROM strategy_builds WHERE id = ? LIMIT 1").bind(id).first();
  if (!exists) return json({ error: "공략을 찾을 수 없습니다." }, { status: 404 });
  const voterHash = await visitorHash(request, env.VOTE_HMAC_SECRET);
  const result = await env.DB.prepare("INSERT INTO strategy_votes (build_id, voter_hash) VALUES (?, ?) ON CONFLICT DO NOTHING")
    .bind(id, voterHash)
    .run();
  if (!result.meta.changes) return json({ error: "같은 네트워크에서는 한 번만 추천할 수 있습니다." }, { status: 409 });
  return json({ ok: true });
}

async function listReports(env: PagesEnv) {
  const result = await env.DB.prepare(`
    SELECT id, relation_type, subject_skill_id, subject_mode, related_skill_id, related_mode, dataset_version, evidence, created_at
    FROM relation_reports
    ORDER BY created_at DESC
    LIMIT 100
  `).all<{ id: number; relation_type: "synergy" | "counter"; subject_skill_id: number; subject_mode: "direct" | "reverse"; related_skill_id: number; related_mode: "direct" | "reverse"; dataset_version: string; evidence: string; created_at: number }>();
  return json({
    reports: result.results.map((row) => ({
      id: row.id,
      relationType: row.relation_type,
      subjectSkillId: row.subject_skill_id,
      subjectMode: row.subject_mode,
      relatedSkillId: row.related_skill_id,
      relatedMode: row.related_mode,
      datasetVersion: row.dataset_version,
      evidence: row.evidence,
      createdAt: row.created_at,
    })),
  }, { headers: { "cache-control": "public, max-age=10" } });
}

async function createReport(request: Request, env: PagesEnv) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 8_000) return json({ error: "요청이 너무 큽니다." }, { status: 413 });
  const body = await request.json() as Record<string, unknown>;
  const relationType = body.relationType === "synergy" || body.relationType === "counter" ? body.relationType : null;
  if (!relationType) throw new Error("관계 유형이 올바르지 않습니다.");
  const subjectSkillId = validateSkillId(body.subjectSkillId);
  const relatedSkillId = validateSkillId(body.relatedSkillId);
  if (subjectSkillId === relatedSkillId) throw new Error("서로 다른 두 공법을 선택해 주세요.");
  const subjectMode = validateMode(body.subjectMode);
  const relatedMode = validateMode(body.relatedMode);
  const datasetVersion = typeof body.datasetVersion === "string" ? body.datasetVersion.slice(0, 160) : "unknown";
  const evidence = validateEvidence(body.evidence);
  const reporterHash = await visitorHash(request, env.VOTE_HMAC_SECRET);
  const cutoff = Math.floor(Date.now() / 1000) - 60;
  const recent = await env.DB.prepare("SELECT id FROM relation_reports WHERE reporter_hash = ?1 AND created_at >= ?2 LIMIT 1").bind(reporterHash, cutoff).first();
  if (recent) return json({ error: "관계 제보는 1분에 한 번만 가능합니다." }, { status: 429 });
  try {
    const result = await env.DB.prepare(`
      INSERT INTO relation_reports (relation_type, subject_skill_id, subject_mode, related_skill_id, related_mode, dataset_version, evidence, reporter_hash)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      RETURNING id
    `).bind(relationType, subjectSkillId, subjectMode, relatedSkillId, relatedMode, datasetVersion, evidence, reporterHash).first<{ id: number }>();
    return json({ id: result?.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed.*relation_reports/i.test(error.message)) {
      return json({ error: "같은 관계는 한 번만 제보할 수 있습니다." }, { status: 409 });
    }
    throw error;
  }
}

async function handleApi(request: Request, env: PagesEnv, url: URL) {
  if (url.pathname === "/api/strategies") {
    if (request.method === "GET") return listStrategies(env);
    if (request.method === "POST") return createStrategy(request, env);
    return json({ error: "허용되지 않은 요청입니다." }, { status: 405, headers: { allow: "GET, POST" } });
  }
  const match = url.pathname.match(/^\/api\/strategies\/(\d+)\/vote$/);
  if (match) {
    if (request.method !== "POST") return json({ error: "허용되지 않은 요청입니다." }, { status: 405, headers: { allow: "POST" } });
    return vote(request, env, Number(match[1]));
  }
  if (url.pathname === "/api/reports") {
    if (request.method === "GET") return listReports(env);
    if (request.method === "POST") return createReport(request, env);
    return json({ error: "허용되지 않은 요청입니다." }, { status: 405, headers: { allow: "GET, POST" } });
  }
  return json({ error: "API를 찾을 수 없습니다." }, { status: 404 });
}

const pagesWorker = {
  async fetch(request: Request, env: PagesEnv): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
      if (error instanceof Error && ["제목", "운공", "무공", "관계", "공법", "수련", "근거", "서로"].some((prefix) => error.message.startsWith(prefix))) {
        return json({ error: error.message }, { status: 400 });
      }
      console.error("Pages request failed", error);
      return json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
    }
  },
};

export default pagesWorker;

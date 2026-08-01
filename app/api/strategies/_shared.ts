export type PublicPlan = {
  equipped: { skillId: number; mode: "direct" | "reverse"; mastered: boolean }[];
  genericAllocation: number[];
  maxSlots: boolean;
};

export function validatePlan(value: unknown): PublicPlan {
  const plan = value as Partial<PublicPlan>;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.equipped) || plan.equipped.length > 30) throw new Error("운공 조합 형식이 올바르지 않습니다.");
  const equipped = plan.equipped.map((entry) => {
    if (!Number.isInteger(entry?.skillId) || entry.skillId < 0 || entry.skillId > 100000 || !["direct", "reverse"].includes(entry.mode)) throw new Error("운공 조합의 무공 정보가 올바르지 않습니다.");
    return { skillId: entry.skillId, mode: entry.mode, mastered: Boolean(entry.mastered) };
  });
  const genericAllocation = Array.isArray(plan.genericAllocation) ? plan.genericAllocation.slice(0, 4).map((value) => Math.max(0, Math.min(9, Number(value) || 0))) : [0, 0, 0, 0];
  while (genericAllocation.length < 4) genericAllocation.push(0);
  return { equipped, genericAllocation, maxSlots: Boolean(plan.maxSlots) };
}

export function validateTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (title.length < 2 || title.length > 32) throw new Error("제목은 2~32자로 입력해 주세요.");
  if (/[<>\u0000-\u001f]/.test(title) || /https?:\/\//i.test(title)) throw new Error("제목에 링크나 제어 문자를 넣을 수 없습니다.");
  return title;
}

export async function visitorHash(request: Request) {
  const headers = request.headers;
  const ip = headers.get("cf-connecting-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const workerEnv = (globalThis as typeof globalThis & { __TAIWU_WORKER_ENV__?: Record<string, unknown> }).__TAIWU_WORKER_ENV__;
  const secret = String(workerEnv?.VOTE_HMAC_SECRET || "local-development-only");
  const bytes = new TextEncoder().encode(`${secret}\u0000${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function errorResponse(error: unknown, fallbackStatus = 400) {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  const databaseMissing = /no such table|strategy_builds|strategy_votes/.test(message);
  return Response.json({ error: databaseMissing ? "게시판 데이터베이스 준비 중입니다." : message }, { status: databaseMissing ? 503 : fallbackStatus });
}

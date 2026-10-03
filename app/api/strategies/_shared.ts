export type PublicPlan = {
  schemaVersion: number;
  equipped: { skillId: number; mode: "direct" | "reverse"; mastered: boolean; legendaryBookReduced: boolean }[];
  genericAllocation: number[];
  maxSlots: boolean;
};

export const STRATEGY_PLAN_SCHEMA_VERSION = 2;

export function validatePlan(value: unknown): PublicPlan {
  const plan = value as Partial<PublicPlan>;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.equipped) || plan.equipped.length > 30) throw new Error("운공 조합 형식이 올바르지 않습니다.");
  const equipped = plan.equipped.map((entry) => {
    if (!Number.isInteger(entry?.skillId) || entry.skillId < 0 || entry.skillId > 100000 || !["direct", "reverse"].includes(entry.mode)) throw new Error("운공 조합의 무공 정보가 올바르지 않습니다.");
    const legendaryBookReduced = Boolean(entry.legendaryBookReduced);
    return { skillId: entry.skillId, mode: entry.mode, mastered: Boolean(entry.mastered) && !legendaryBookReduced, legendaryBookReduced };
  });
  const genericAllocation = Array.isArray(plan.genericAllocation) ? plan.genericAllocation.slice(0, 4).map((value) => Math.max(0, Math.min(12, Number(value) || 0))) : [0, 0, 0, 0];
  while (genericAllocation.length < 4) genericAllocation.push(0);
  return { schemaVersion: STRATEGY_PLAN_SCHEMA_VERSION, equipped, genericAllocation, maxSlots: Boolean(plan.maxSlots) };
}

export function readStoredPlan(value: unknown) {
  const sourceSchemaVersion = Number((value as { schemaVersion?: unknown } | null)?.schemaVersion);
  return {
    plan: validatePlan(value),
    planMigrated: !Number.isInteger(sourceSchemaVersion) || sourceSchemaVersion < STRATEGY_PLAN_SCHEMA_VERSION,
  };
}

export function validateTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (title.length < 2 || title.length > 32) throw new Error("제목은 2~32자로 입력해 주세요.");
  if (/[<>\u0000-\u001f]/.test(title) || /https?:\/\//i.test(title)) throw new Error("제목에 링크나 제어 문자를 넣을 수 없습니다.");
  return title;
}

export function validateContent(value: unknown) {
  const content = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  if (content.length < 10 || content.length > 2000) throw new Error("공략 본문은 10~2000자로 입력해 주세요.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) throw new Error("공략 본문에 제어 문자를 넣을 수 없습니다.");
  return content;
}

export function validatePassword(value: unknown) {
  const password = typeof value === "string" ? value.normalize("NFKC") : "";
  if (password.length < 8 || password.length > 72) throw new Error("비밀번호는 8~72자로 입력해 주세요.");
  if (/[\u0000-\u001f\u007f]/.test(password)) throw new Error("비밀번호에 제어 문자를 넣을 수 없습니다.");
  return password;
}

const passwordEncoder = new TextEncoder();
const passwordIterations = 100_000;

function toHex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) throw new Error("저장된 비밀번호 정보가 손상되었습니다.");
  return Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
}

async function derivePasswordHash(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", passwordEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
}

export async function createPasswordRecord(passwordValue: unknown) {
  const password = validatePassword(passwordValue);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt);
  const digest = await derivePasswordHash(password, saltHex, passwordIterations);
  return { passwordHash: `pbkdf2-sha256$${passwordIterations}$${digest}`, passwordSalt: saltHex };
}

export async function verifyPassword(passwordValue: unknown, storedHash: string | null, saltHex: string | null) {
  if (!storedHash || !saltHex) return false;
  const password = validatePassword(passwordValue);
  const [algorithm, iterationsText, expected] = storedHash.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > passwordIterations || !/^[0-9a-f]{64}$/i.test(expected || "")) return false;
  const actual = await derivePasswordHash(password, saltHex, iterations);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export async function visitorHash(request: Request) {
  const headers = request.headers;
  const ip = headers.get("cf-connecting-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const { env } = await import("cloudflare:workers");
  const secret = String((env as Cloudflare.Env & { VOTE_HMAC_SECRET?: string }).VOTE_HMAC_SECRET || "local-development-only");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function errorResponse(error: unknown, fallbackStatus = 400) {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  const databaseMissing = /no such table|no such column|strategy_builds|strategy_votes|relation_reports/.test(message);
  return Response.json({ error: databaseMissing ? "게시판 데이터베이스 준비 중입니다." : message }, { status: databaseMissing ? 503 : fallbackStatus });
}

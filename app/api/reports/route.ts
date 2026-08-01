import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../db";
import { relationReports } from "../../../db/schema";
import { errorResponse, visitorHash } from "../strategies/_shared";

type Mode = "direct" | "reverse";
type RelationType = "synergy" | "counter";

function validateMode(value: unknown): Mode {
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

export async function GET() {
  try {
    const db = await getDb();
    const reports = await db.select({
      id: relationReports.id,
      relationType: relationReports.relationType,
      subjectSkillId: relationReports.subjectSkillId,
      subjectMode: relationReports.subjectMode,
      relatedSkillId: relationReports.relatedSkillId,
      relatedMode: relationReports.relatedMode,
      datasetVersion: relationReports.datasetVersion,
      evidence: relationReports.evidence,
      createdAt: relationReports.createdAt,
    }).from(relationReports).orderBy(desc(relationReports.createdAt)).limit(100);
    return Response.json({ reports }, { headers: { "cache-control": "public, max-age=10" } });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const relationType = body.relationType === "synergy" || body.relationType === "counter" ? body.relationType as RelationType : null;
    if (!relationType) throw new Error("관계 유형이 올바르지 않습니다.");
    const subjectSkillId = validateSkillId(body.subjectSkillId);
    const relatedSkillId = validateSkillId(body.relatedSkillId);
    if (subjectSkillId === relatedSkillId) throw new Error("서로 다른 두 공법을 선택해 주세요.");
    const subjectMode = validateMode(body.subjectMode);
    const relatedMode = validateMode(body.relatedMode);
    const datasetVersion = typeof body.datasetVersion === "string" ? body.datasetVersion.slice(0, 160) : "unknown";
    const evidence = validateEvidence(body.evidence);
    const reporterHash = await visitorHash(request);
    const db = await getDb();
    const recent = await db.select({ id: relationReports.id }).from(relationReports)
      .where(and(eq(relationReports.reporterHash, reporterHash), gte(relationReports.createdAt, Math.floor(Date.now() / 1000) - 60)))
      .limit(1);
    if (recent.length) return Response.json({ error: "관계 제보는 1분에 한 번만 가능합니다." }, { status: 429 });
    const [created] = await db.insert(relationReports).values({ relationType, subjectSkillId, subjectMode, relatedSkillId, relatedMode, datasetVersion, evidence, reporterHash }).returning({ id: relationReports.id });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

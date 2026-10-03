import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../db";
import { strategyBuilds, strategyVotes } from "../../../db/schema";
import { createPasswordRecord, errorResponse, readStoredPlan, validateContent, validatePassword, validatePlan, validateTitle, visitorHash } from "./_shared";

export async function GET() {
  try {
    const db = await getDb();
    const voteCount = count(strategyVotes.id);
    const rows = await db.select({
      id: strategyBuilds.id,
      title: strategyBuilds.title,
      content: strategyBuilds.content,
      datasetVersion: strategyBuilds.datasetVersion,
      planJson: strategyBuilds.planJson,
      createdAt: strategyBuilds.createdAt,
      updatedAt: strategyBuilds.updatedAt,
      votes: voteCount,
    }).from(strategyBuilds)
      .leftJoin(strategyVotes, eq(strategyVotes.buildId, strategyBuilds.id))
      .groupBy(strategyBuilds.id)
      .orderBy(desc(voteCount), desc(strategyBuilds.createdAt))
      .limit(100);
    return Response.json({ strategies: rows.map((row) => {
      const stored = readStoredPlan(JSON.parse(row.planJson));
      return { ...row, ...stored, planJson: undefined };
    }) }, { headers: { "cache-control": "public, max-age=15" } });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { title?: unknown; content?: unknown; password?: unknown; datasetVersion?: unknown; plan?: unknown };
    const title = validateTitle(body.title);
    const content = validateContent(body.content);
    const password = validatePassword(body.password);
    const plan = validatePlan(body.plan);
    if (!plan.equipped.length) throw new Error("무공을 하나 이상 배치해 주세요.");
    const datasetVersion = typeof body.datasetVersion === "string" ? body.datasetVersion.slice(0, 160) : "unknown";
    const authorHash = await visitorHash(request);
    const db = await getDb();
    const recent = await db.select({ id: strategyBuilds.id }).from(strategyBuilds)
      .where(and(eq(strategyBuilds.authorHash, authorHash), gte(strategyBuilds.createdAt, Math.floor(Date.now() / 1000) - 60)))
      .limit(1);
    if (recent.length) return Response.json({ error: "공략 등록은 1분에 한 번만 가능합니다." }, { status: 429 });
    const passwordRecord = await createPasswordRecord(password);
    const [created] = await db.insert(strategyBuilds).values({ title, content, datasetVersion, planJson: JSON.stringify(plan), authorHash, ...passwordRecord, updatedAt: Math.floor(Date.now() / 1000) }).returning({ id: strategyBuilds.id });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { strategyBuilds, strategyVotes } from "../../../../../db/schema";
import { errorResponse, visitorHash } from "../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id < 1) throw new Error("공략 번호가 올바르지 않습니다.");
    const db = await getDb();
    const exists = await db.select({ id: strategyBuilds.id }).from(strategyBuilds).where(eq(strategyBuilds.id, id)).limit(1);
    if (!exists.length) return Response.json({ error: "공략을 찾을 수 없습니다." }, { status: 404 });
    const voterHash = await visitorHash(_request);
    const inserted = await db.insert(strategyVotes).values({ buildId: id, voterHash }).onConflictDoNothing().returning({ id: strategyVotes.id });
    if (!inserted.length) return Response.json({ error: "같은 네트워크에서는 한 번만 추천할 수 있습니다." }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { strategyBuilds } from "../../../../db/schema";
import { errorResponse, validateContent, validateTitle, verifyPassword } from "../_shared";

async function strategyId(context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) throw new Error("공략 번호가 올바르지 않습니다.");
  return id;
}

async function authenticate(id: number, password: unknown) {
  const db = await getDb();
  const [strategy] = await db.select({ id: strategyBuilds.id, passwordHash: strategyBuilds.passwordHash, passwordSalt: strategyBuilds.passwordSalt })
    .from(strategyBuilds).where(eq(strategyBuilds.id, id)).limit(1);
  if (!strategy) return { response: Response.json({ error: "공략을 찾을 수 없습니다." }, { status: 404 }) } as const;
  if (!strategy.passwordHash || !strategy.passwordSalt) return { response: Response.json({ error: "비밀번호 기능 도입 전 작성된 글은 관리자만 변경할 수 있습니다." }, { status: 409 }) } as const;
  if (!await verifyPassword(password, strategy.passwordHash, strategy.passwordSalt)) return { response: Response.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 403 }) } as const;
  return { db } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = await strategyId(context);
    const body = await request.json() as { title?: unknown; content?: unknown; password?: unknown };
    const title = validateTitle(body.title);
    const content = validateContent(body.content);
    const authenticated = await authenticate(id, body.password);
    if ("response" in authenticated) return authenticated.response;
    await authenticated.db.update(strategyBuilds).set({ title, content, updatedAt: Math.floor(Date.now() / 1000) }).where(eq(strategyBuilds.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = await strategyId(context);
    const body = await request.json() as { password?: unknown };
    const authenticated = await authenticate(id, body.password);
    if ("response" in authenticated) return authenticated.response;
    await authenticated.db.delete(strategyBuilds).where(eq(strategyBuilds.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

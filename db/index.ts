import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  const binding = (env as Cloudflare.Env).DB;
  if (!binding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Connect the Pages project to the planner database before using the board."
    );
  }

  return drizzle(binding, { schema });
}

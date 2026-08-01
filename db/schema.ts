import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const strategyBuilds = sqliteTable("strategy_builds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  datasetVersion: text("dataset_version").notNull(),
  planJson: text("plan_json").notNull(),
  authorHash: text("author_hash").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (table) => [
  index("strategy_builds_created_at_idx").on(table.createdAt),
  index("strategy_builds_author_hash_idx").on(table.authorHash),
]);

export const strategyVotes = sqliteTable("strategy_votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildId: integer("build_id").notNull().references(() => strategyBuilds.id, { onDelete: "cascade" }),
  voterHash: text("voter_hash").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (table) => [
  uniqueIndex("strategy_votes_build_voter_idx").on(table.buildId, table.voterHash),
  index("strategy_votes_build_idx").on(table.buildId),
]);

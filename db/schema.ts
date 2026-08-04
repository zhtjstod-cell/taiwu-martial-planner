import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const strategyBuilds = sqliteTable("strategy_builds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  datasetVersion: text("dataset_version").notNull(),
  planJson: text("plan_json").notNull(),
  authorHash: text("author_hash").notNull(),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at"),
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

export const relationReports = sqliteTable("relation_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  relationType: text("relation_type", { enum: ["synergy", "counter"] }).notNull(),
  subjectSkillId: integer("subject_skill_id").notNull(),
  subjectMode: text("subject_mode", { enum: ["direct", "reverse"] }).notNull(),
  relatedSkillId: integer("related_skill_id").notNull(),
  relatedMode: text("related_mode", { enum: ["direct", "reverse"] }).notNull(),
  datasetVersion: text("dataset_version").notNull(),
  evidence: text("evidence").notNull(),
  reporterHash: text("reporter_hash").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
}, (table) => [
  index("relation_reports_created_at_idx").on(table.createdAt),
  index("relation_reports_reporter_hash_idx").on(table.reporterHash),
  uniqueIndex("relation_reports_duplicate_idx").on(
    table.reporterHash,
    table.relationType,
    table.subjectSkillId,
    table.subjectMode,
    table.relatedSkillId,
    table.relatedMode,
    table.datasetVersion,
  ),
]);

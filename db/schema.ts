import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const downloadRequests = sqliteTable("download_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  occupation: text("occupation").notNull(),
  organization: text("organization").notNull(),
  purpose: text("purpose").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

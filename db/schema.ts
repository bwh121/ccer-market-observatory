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

export const feedbackSubmissions = sqliteTable("feedback_submissions", {
  id: text("id").primaryKey(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const feedbackMessages = sqliteTable("feedback_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  submissionId: text("submission_id")
    .notNull()
    .references(() => feedbackSubmissions.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  message: text("message").notNull(),
});

export const feedbackAttachments = sqliteTable("feedback_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  submissionId: text("submission_id")
    .notNull()
    .references(() => feedbackSubmissions.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull(),
});

import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const feedbackTable = pgTable("feedback", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).pick({
  name: true,
  category: true,
  content: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedbackTable.$inferSelect;
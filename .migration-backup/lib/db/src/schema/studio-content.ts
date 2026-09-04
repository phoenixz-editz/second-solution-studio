import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const studioContentTable = pgTable("studio_content", {
  key: text("key").primaryKey(),
  text: text("text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudioContentSchema = createInsertSchema(studioContentTable).pick({
  key: true,
  text: true,
});

export type InsertStudioContent = z.infer<typeof insertStudioContentSchema>;
export type StudioContent = typeof studioContentTable.$inferSelect;
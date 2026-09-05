import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, feedbackTable } from "@workspace/db";
import {
  CreateFeedbackBody,
  CreateFeedbackResponse,
  ListFeedbackResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeFeedback(entry: typeof feedbackTable.$inferSelect) {
  return {
    id: entry.id,
    name: entry.name,
    email: entry.email,
    timestamp: entry.createdAt.toISOString(),
    category: entry.category,
    content: entry.content,
  };
}

router.get("/feedback", async (req, res): Promise<void> => {
  try {
    const entries = await db
      .select()
      .from(feedbackTable)
      .orderBy(desc(feedbackTable.createdAt));
    res.json(ListFeedbackResponse.parse(entries.map(serializeFeedback)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list feedback");
    res.status(503).json({ error: "Feedback is temporarily unavailable." });
  }
});

router.post("/feedback", async (req, res): Promise<void> => {
  const parsed = CreateFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const content = parsed.data.content.trim();
  if (!name || !email || !content || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Name, a valid email, and feedback content are required." });
    return;
  }

  try {
    const [entry] = await db
      .insert(feedbackTable)
      .values({
        name,
        email,
        category: parsed.data.category,
        content,
      })
      .returning();

    if (!entry) {
      res.status(503).json({ error: "Feedback could not be stored." });
      return;
    }

    res.status(201).json(CreateFeedbackResponse.parse(serializeFeedback(entry)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to store feedback");
    res.status(503).json({ error: "Feedback is temporarily unavailable." });
  }
});

export default router;
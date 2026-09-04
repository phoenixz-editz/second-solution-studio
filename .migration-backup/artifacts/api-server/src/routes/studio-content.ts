import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, studioContentTable } from "@workspace/db";
import {
  ListStudioContentResponse,
  UpdateStudioContentBody,
  UpdateStudioContentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const DEVELOPER_EMAIL = "jhoncena4581@gmail.com";
const DEVELOPER_PASSWORD = "developer$000";

function serializeContent(entry: typeof studioContentTable.$inferSelect) {
  return {
    key: entry.key,
    text: entry.text,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

router.get("/studio-content", async (req, res): Promise<void> => {
  try {
    const entries = await db
      .select()
      .from(studioContentTable)
      .orderBy(asc(studioContentTable.key));
    res.json(ListStudioContentResponse.parse(entries.map(serializeContent)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list shared Studio content");
    res.status(503).json({ error: "Studio content is temporarily unavailable." });
  }
});

router.put("/studio-content", async (req, res): Promise<void> => {
  const parsed = UpdateStudioContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (
    parsed.data.developerEmail !== DEVELOPER_EMAIL
    || parsed.data.developerPassword !== DEVELOPER_PASSWORD
  ) {
    res.status(403).json({ error: "Developer credentials are invalid." });
    return;
  }

  const key = parsed.data.key.trim();
  const text = parsed.data.text;
  if (!key || !text.trim()) {
    res.status(400).json({ error: "A content key and non-empty text are required." });
    return;
  }

  try {
    const [entry] = await db
      .insert(studioContentTable)
      .values({ key, text })
      .onConflictDoUpdate({
        target: studioContentTable.key,
        set: { text, updatedAt: new Date() },
      })
      .returning();

    if (!entry) {
      res.status(503).json({ error: "Studio content could not be stored." });
      return;
    }

    res.json(UpdateStudioContentResponse.parse(serializeContent(entry)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to store shared Studio content");
    res.status(503).json({ error: "Studio content is temporarily unavailable." });
  }
});

export default router;
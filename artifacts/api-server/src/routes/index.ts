import { Router, type IRouter } from "express";
import healthRouter from "./health";
import validateRouter from "./validate";
import feedbackRouter from "./feedback";
import studioContentRouter from "./studio-content";

const router: IRouter = Router();

router.use(healthRouter);
router.use(validateRouter);
router.use(feedbackRouter);
router.use(studioContentRouter);

export default router;

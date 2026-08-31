import { Router, type IRouter } from "express";
import healthRouter from "./health";
import validateRouter from "./validate";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(validateRouter);
router.use(feedbackRouter);

export default router;

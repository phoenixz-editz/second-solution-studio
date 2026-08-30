import { Router, type IRouter } from "express";
import healthRouter from "./health";
import validateRouter from "./validate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(validateRouter);

export default router;

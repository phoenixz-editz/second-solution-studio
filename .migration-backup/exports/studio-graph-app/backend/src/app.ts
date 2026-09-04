import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
app.set("trust proxy", 1);

const rateWindowMs = 60_000;
const maxValidationRequestsPerWindow = 30;
const validationRate = new Map<string, { startedAt: number; count: number }>();

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (process.env["NODE_ENV"] === "production" && req.get("x-forwarded-proto") !== "https") {
    const host = req.get("host");
    if (host) {
      res.redirect(308, `https://${host}${req.originalUrl}`);
      return;
    }
  }
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env["CLERK_PUBLISHABLE_KEY"],
    ),
  })),
);
app.use((req, res, next) => {
  if (req.path !== "/api/validate") {
    next();
    return;
  }
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || req.ip || "unknown";
  const now = Date.now();
  const current = validationRate.get(address);
  if (!current || now - current.startedAt >= rateWindowMs) {
    validationRate.set(address, { startedAt: now, count: 1 });
    next();
    return;
  }
  if (current.count >= maxValidationRequestsPerWindow) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Too many validation requests. Try again in a minute." });
    return;
  }
  current.count += 1;
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;

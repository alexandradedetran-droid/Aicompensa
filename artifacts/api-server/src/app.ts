import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Security headers (Helmet) ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // SPA served separately; handled by Vite
    crossOriginEmbedderPolicy: false,
  }),
);

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env["ALLOWED_ORIGINS"]
  ? process.env["ALLOWED_ORIGINS"].split(",").map((o) => o.trim())
  : true; // allow all in dev

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-token"],
    credentials: false,
  }),
);

// ── Global rate limiter: 200 req / 1 min per IP ───────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em breve." },
  skip: (req) => req.method === "OPTIONS",
});
app.use(globalLimiter);

// ── Request logging ────────────────────────────────────────────────────────────
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

// ── Body parsing — limit to 1 MB (covers base64 JPEG ≤500 KB) ────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

// ── Global error middleware ───────────────────────────────────────────────────
// Must have 4 parameters so Express recognises it as an error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled server error");
  res.status(500).json({ error: "Erro interno do servidor. Tente novamente mais tarde." });
});

export default app;

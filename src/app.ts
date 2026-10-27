import cors from "cors";
import colors from "colors";
import helmet from "helmet";
import express from "express";
import routes from "./routes";
import { logger } from "./config/logger";
import { config } from "./config/config";
import { ipBlocker } from "./config/ipBlocker";
import { limiter } from "./middlewares/limiter";
import { corsOptions } from "./middlewares/corsMiddleware";
import { notFoundHandler } from "./middlewares/notFounHandler";
import { globalErrorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(ipBlocker);

// Security Middleware
app.use(helmet());
if (config.cors.enabled) app.use(cors(corsOptions));
else console.log("⚠️  CORS is disabled by config");

if (config.security.rateLimitEnabled) {
  app.set("trust proxy", 1);
  app.use(limiter);
  console.log("✅ Rate limiter enabled");
}

// Middleware for parsing JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Response-Time Logging Middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const startTime = process.hrtime();

  res.on("finish", () => {
    const diff = process.hrtime(startTime);
    const responseTime = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    const fetchStatus = () => {
      if (res.statusCode >= 500) return colors.red(`${res.statusCode}`);
      if (res.statusCode >= 400) return colors.yellow(`${res.statusCode}`);
      if (res.statusCode >= 300) return colors.cyan(`${res.statusCode}`);
      if (res.statusCode >= 200) return colors.green(`${res.statusCode}`);
      return colors.white(`${res.statusCode}`);
    };

    logger.info(
      `${"METHOD:".blue} ${req.method.yellow} - ${"URL:".blue} ${req.originalUrl.yellow
      } - ${"STATUS:".blue} ${fetchStatus()} - ${"Response Time:".blue} ${responseTime.magenta
      } ${"ms".magenta}`
    );
  });

  next();
});


// Health check route for uptime monitoring
app.get("/health", (_req, res) => {
  return res.status(200).json({ status: "OK", message: "Server is healthy" });
});

// Handle Public API Routes
app.use("/api", routes);

// Handle 404 errors
app.use(notFoundHandler);

// Handle global errors
app.use(globalErrorHandler);

export default app;

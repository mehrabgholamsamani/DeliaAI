import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import {
  apiNotFoundHandler,
  errorHandler,
  requestContext,
  requestLogging
} from "./middleware/errorHandling.js";
import {
  apiLimiter,
  createCorsOptions,
  noStoreApiResponses,
  requestTimeout,
  securityHeaders
} from "./middleware/security.js";
import { router } from "./routes.js";

export function createApp() {
  const app = express();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDist = path.resolve(__dirname, "../client");

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(requestContext);
  app.use(requestLogging);
  app.use(requestTimeout);
  app.use(securityHeaders);
  app.use(cors(createCorsOptions()));
  app.use(cookieParser(config.ADMIN_SESSION_SECRET));
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", noStoreApiResponses);
  app.use("/api", apiLimiter);
  app.use("/api", router);
  app.use("/api", apiNotFoundHandler);

  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  app.use(errorHandler);

  return app;
}

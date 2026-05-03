import type { Server } from "node:http";
import mongoose from "mongoose";
import { sendStartupFailureAlert, startMonitorAlertScheduler } from "./alerting.js";
import { createApp } from "./app.js";
import { startAutomatedEmailScheduler } from "./automatedEmails.js";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";
import { startEmailJobWorker } from "./emailJobs.js";
import { logger } from "./logger.js";
import { assertStartupReadiness } from "./startupChecks.js";

const app = createApp();
const port = config.PORT;
let server: Server | undefined;
let stopAutomatedEmailScheduler: (() => void) | undefined;
let stopEmailJobWorker: (() => void) | undefined;
let stopMonitorAlertScheduler: (() => void) | undefined;

async function startServer() {
  try {
    await assertStartupReadiness();
    await connectDatabase();
    stopAutomatedEmailScheduler = startAutomatedEmailScheduler();
    stopEmailJobWorker = startEmailJobWorker();
    stopMonitorAlertScheduler = startMonitorAlertScheduler();
    server = app.listen(port, () => {
      logger.info("API listening", { url: `http://127.0.0.1:${port}` });
    });
  } catch (error) {
    logger.error("Failed to start API server", { error });
    await sendStartupFailureAlert(error).catch((alertError) => {
      logger.error("Failed to send startup failure alert", { error: alertError });
    });
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info("Closing API server", { signal });
  stopAutomatedEmailScheduler?.();
  stopEmailJobWorker?.();
  stopMonitorAlertScheduler?.();

  server?.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
  process.exit(1);
});

void startServer();

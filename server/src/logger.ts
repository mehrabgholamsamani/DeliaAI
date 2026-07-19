type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
}

function writeLog(level: LogLevel, message: string, context: LogContext = {}) {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(context).map(([key, value]) => [
        key,
        key === "error" ? serializeError(value) : value
      ])
    )
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    writeLog("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    writeLog("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    writeLog("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    writeLog("error", message, context);
  }
};

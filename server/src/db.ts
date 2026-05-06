import mongoose from "mongoose";
import { config } from "./config.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

const safeTestDatabasePattern = /^booking_api_test_\d+$/;

function getConfiguredDatabaseName() {
  if (config.MONGODB_DB_NAME) {
    return config.MONGODB_DB_NAME;
  }

  try {
    return new URL(config.MONGODB_URL).pathname.replace(/^\//, "");
  } catch {
    return undefined;
  }
}

export function assertSafeTestDatabaseTarget() {
  const databaseName = mongoose.connection.db?.databaseName || getConfiguredDatabaseName();

  if (config.NODE_ENV !== "test" || !databaseName || !safeTestDatabasePattern.test(databaseName)) {
    throw new Error(
      `Refusing destructive test database operation for database "${databaseName || "unknown"}"`
    );
  }
}

export function connectDatabase() {
  if (connectionPromise) {
    return connectionPromise;
  }

  if (config.NODE_ENV === "test") {
    const databaseName = getConfiguredDatabaseName();

    if (!databaseName || !safeTestDatabasePattern.test(databaseName)) {
      throw new Error(
        `Refusing to run tests against unsafe MongoDB database "${databaseName || "unknown"}"`
      );
    }
  }

  connectionPromise = mongoose
    .connect(config.MONGODB_URL, {
      dbName: config.MONGODB_DB_NAME || undefined,
      serverSelectionTimeoutMS: config.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      connectTimeoutMS: config.MONGODB_CONNECT_TIMEOUT_MS
    })
    .then(async (connection) => {
      await Promise.all(Object.values(connection.models).map((model) => model.init()));
      return connection;
    })
    .catch((error: unknown) => {
      connectionPromise = null;

      if (config.NODE_ENV === "test") {
        const message =
          "Could not connect to the test MongoDB instance. Start MongoDB on the configured MONGODB_URL or set MONGODB_URL to an isolated test database before running npm run test:api.";
        const wrappedError = new Error(message);

        wrappedError.cause = error;
        throw wrappedError;
      }

      throw error;
    });

  return connectionPromise;
}

export async function dropSafeTestDatabase() {
  assertSafeTestDatabaseTarget();
  await mongoose.connection.db?.dropDatabase();
}

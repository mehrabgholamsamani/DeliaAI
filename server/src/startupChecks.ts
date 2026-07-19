import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

function getClientDistPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  return path.resolve(__dirname, "../client");
}

export async function assertStartupReadiness() {
  if (config.NODE_ENV !== "production") {
    return;
  }

  const clientIndexPath = path.join(getClientDistPath(), "index.html");

  try {
    await access(clientIndexPath);
  } catch {
    throw new Error(
      `Production client build is missing at ${clientIndexPath}. Run npm run build before starting.`
    );
  }
}

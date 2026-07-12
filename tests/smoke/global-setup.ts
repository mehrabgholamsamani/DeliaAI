import { createServer } from "vite";

async function isClientAlreadyRunning() {
  try {
    const response = await fetch("http://127.0.0.1:5180", { method: "HEAD" });

    return response.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (await isClientAlreadyRunning()) {
    return async () => undefined;
  }

  const server = await createServer({
    configFile: "apps/web/vite.config.ts",
    root: "apps/web",
    server: {
      host: "127.0.0.1",
      port: 5180,
      strictPort: true
    }
  });

  await server.listen();

  return async () => {
    await server.close();
  };
}

import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { flushErrorReports, initErrorReporting } from "./infrastructure/error-reporting.js";

async function start() {
  initErrorReporting();
  const app = await buildApp();

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
  } catch (error) {
    app.log.error(error);
    await flushErrorReports();
    process.exit(1);
  }
}

start();

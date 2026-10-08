import { execFileSync } from "node:child_process";

import Redis from "ioredis";
import pg from "pg";

import { testDatabaseServerUrl, testEnv } from "./env.mjs";

const TEST_DATABASE = /^grocery_test_\d+$/;

async function onServer(statements: (client: pg.Client) => Promise<void>) {
  const client = new pg.Client({ connectionString: testDatabaseServerUrl });
  await client.connect();
  try {
    await statements(client);
  } finally {
    await client.end();
  }
}

/** Creates this run's database from the migrations, seeds it, and empties the test Redis database. */
export default async function setup() {
  const database = process.env.TEST_DATABASE_NAME!;
  if (!TEST_DATABASE.test(database)) throw new Error(`Unexpected test database name "${database}"`);

  await onServer(async (client) => {
    const { rows } = await client.query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname LIKE 'grocery_test_%'");
    // Left by runs interrupted over an hour ago; a run still in progress keeps its database.
    for (const { datname } of rows) {
      const startedAt = Number(datname.slice("grocery_test_".length));
      if (TEST_DATABASE.test(datname) && Date.now() - startedAt > 3600_000) {
        await client.query(`DROP DATABASE "${datname}" WITH (FORCE)`);
      }
    }
    await client.query(`CREATE DATABASE "${database}"`);
  });

  const env = { ...process.env, ...testEnv };
  const run = (args: string[]) => {
    try {
      execFileSync("pnpm", ["exec", ...args], { env, stdio: "pipe" });
    } catch (error) {
      const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(`${args.join(" ")} failed:\n${stdout ?? ""}${stderr ?? ""}`);
    }
  };
  run(["prisma", "migrate", "deploy"]);
  run(["tsx", "src/infrastructure/database/seed.ts"]);

  const redis = new Redis(testEnv.REDIS_URL);
  await redis.flushdb();
  redis.disconnect();

  return async () => {
    await onServer(async (client) => {
      await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    });
  };
}

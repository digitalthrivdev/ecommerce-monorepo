import { parseArgs } from "node:util";

import { prisma } from "../infrastructure/database/prisma.js";
import { redis } from "../infrastructure/redis/client.js";
import { emailSchema, phoneSchema } from "../shared/schemas.js";
import { revokedTokensKey } from "../shared/token-revocation.js";

const USAGE = `Marks an existing account as a test account for demos, or makes it a normal account again.
A test admin can only look and move orders to a rider; test staff, customers and riders are limited. The account is signed
out on every device so the change applies at its next sign-in.

  Development:  pnpm --filter @grocery/api test-account --email demo-admin@example.com
  Production:   docker compose run --rm api node dist/scripts/test-account.js --phone +919000000010
  Undo:         docker compose run --rm api node dist/scripts/test-account.js --phone +919000000010 --off

Options:
  --email  Email of an admin or store staff account.
  --phone  Phone number (E.164) of a customer or rider account.
  --off    Make it a normal account again.

Create the accounts first: admins with create-admin, staff and riders in the dashboard, and the
customer by signing in to the app once.`;

// Longer than any token lifetime; it only rejects tokens issued before now.
const REVOCATION_TTL_SECONDS = 400 * 24 * 3600;

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      phone: { type: "string" },
      off: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || !values.email === !values.phone) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const lookup = values.email ? emailSchema.safeParse(values.email) : phoneSchema.safeParse(values.phone);
  if (!lookup.success) {
    console.error(lookup.error.issues[0]?.message);
    return 1;
  }

  const where = values.email ? { email: lookup.data } : { phone: lookup.data };
  const user = await prisma.user.findUnique({ where, select: { id: true, role: true, isTestAccount: true, deletedAt: true } });
  if (!user || user.deletedAt) {
    console.error(`No account uses ${lookup.data}.`);
    return 1;
  }

  const isTestAccount = !values.off;
  if (user.isTestAccount === isTestAccount) {
    console.log(`${lookup.data} (${user.role}) is already ${isTestAccount ? "a test" : "a normal"} account.`);
    return 0;
  }

  await prisma.user.update({ where: { id: user.id }, data: { isTestAccount } });
  await redis.set(revokedTokensKey(user.id), String(Math.floor(Date.now() / 1000)), "EX", REVOCATION_TTL_SECONDS);
  console.log(`${lookup.data} (${user.role}) is now ${isTestAccount ? "a test" : "a normal"} account and has been signed out.`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([prisma.$disconnect(), redis.quit()]));

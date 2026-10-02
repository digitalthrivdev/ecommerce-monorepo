import { parseArgs } from "node:util";

import { UserRole } from "../generated/prisma/client";
import { prisma } from "../infrastructure/database/prisma.js";
import { phoneSchema } from "../shared/schemas.js";

const USAGE = `Creates an admin account, e.g. the first admin of a new deployment.

  Development:  pnpm --filter @grocery/api admin:create --phone +919876543210 --name "Asha Rao"
  Production:   node dist/scripts/create-admin.js --phone +919876543210 --name "Asha Rao"

Options:
  --phone    Phone number in E.164 format (required). The admin signs in with an OTP sent to it.
  --name     Display name (optional).
  --promote  Make an existing customer account an admin.`;

async function main() {
  const { values } = parseArgs({
    options: {
      phone: { type: "string" },
      name: { type: "string" },
      promote: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || !values.phone) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const phone = phoneSchema.safeParse(values.phone);
  if (!phone.success) {
    console.error(phone.error.issues[0]?.message);
    return 1;
  }
  const name = values.name?.trim() || null;

  const existing = await prisma.user.findUnique({ where: { phone: phone.data }, select: { id: true, role: true } });

  if (!existing) {
    await prisma.user.create({ data: { phone: phone.data, name, role: UserRole.ADMIN } });
    console.log(`Created admin ${phone.data}.`);
  } else if (existing.role === UserRole.ADMIN) {
    console.log(`${phone.data} is already an admin. Nothing changed.`);
    return 0;
  } else if (existing.role !== UserRole.CUSTOMER) {
    // Staff and partner accounts are tied to a store or partner profile; use a different phone.
    console.error(`${phone.data} belongs to a ${existing.role} account. Use another phone number for the admin.`);
    return 1;
  } else if (!values.promote) {
    console.error(`${phone.data} is a customer account. Run again with --promote to make it an admin.`);
    return 1;
  } else {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: UserRole.ADMIN, ...(name && { name }) },
    });
    console.log(`Promoted ${phone.data} to admin.`);
  }

  console.log("Sign in to the admin dashboard with this phone. Until an SMS provider is set up, the code is written to the API log.");
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
  .finally(() => prisma.$disconnect());

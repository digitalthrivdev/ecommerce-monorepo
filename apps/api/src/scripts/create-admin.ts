import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { UserRole } from "../generated/prisma/client";
import { prisma } from "../infrastructure/database/prisma.js";
import { hashPassword, passwordSchema } from "../shared/password.js";
import { emailSchema, phoneSchema } from "../shared/schemas.js";

const USAGE = `Creates an admin account, or sets a new password for an existing admin. Asks for the password.

  Development:  pnpm --filter @grocery/api admin:create --email asha@example.com --phone +919876543210 --name "Asha Rao"
  Production:   docker compose run --rm api node dist/scripts/create-admin.js --email asha@example.com --phone +919876543210

Options:
  --email    Email the admin signs in with (required).
  --phone    Phone number in E.164 format. Needed when the account does not exist yet.
  --name     Display name (optional).
  --promote  Make an existing customer account an admin.

The password can also be piped in on the first line of stdin.`;

/** Reads a line without echoing it, so the password stays out of the terminal and shell history. */
function promptHidden(question: string) {
  const { stdin, stdout } = process;
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise<string>((resolve) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0003") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          if (char === "\u0003") process.exit(130);
          return resolve(value);
        }
        value = char === "\u007f" || char === "\b" ? value.slice(0, -1) : value + char;
      }
    };
    stdin.on("data", onData);
  });
}

/** Null when the two entries differ. */
async function readPassword() {
  if (!process.stdin.isTTY) {
    for await (const line of createInterface({ input: process.stdin })) return line;
    return "";
  }
  const password = await promptHidden("Password: ");
  if (passwordSchema.safeParse(password).success && (await promptHidden("Repeat password: ")) !== password) {
    return null;
  }
  return password;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      phone: { type: "string" },
      name: { type: "string" },
      promote: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || !values.email) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const email = emailSchema.safeParse(values.email);
  const phone = values.phone === undefined ? undefined : phoneSchema.safeParse(values.phone);
  const firstIssue = (!email.success && email.error.issues[0]) || (phone && !phone.success && phone.error.issues[0]);
  if (firstIssue) {
    console.error(firstIssue.message);
    return 1;
  }
  const name = values.name?.trim() || null;

  const select = { id: true, role: true, email: true } as const;
  const byEmail = await prisma.user.findUnique({ where: { email: email.data! }, select });
  const byPhone = phone?.data ? await prisma.user.findUnique({ where: { phone: phone.data }, select }) : null;

  if (byEmail && byPhone && byEmail.id !== byPhone.id) {
    console.error(`${email.data} and ${phone!.data} belong to different accounts.`);
    return 1;
  }
  const existing = byEmail ?? byPhone;

  if (!existing && !phone?.data) {
    console.error(`No account uses ${email.data}. Add --phone to create the admin.`);
    return 1;
  }
  if (existing && existing.role !== UserRole.ADMIN && existing.role !== UserRole.CUSTOMER) {
    // Staff and partner accounts are tied to a store or partner profile.
    console.error(`That account is ${existing.role}. Use a different email and phone number for the admin.`);
    return 1;
  }
  if (existing?.role === UserRole.CUSTOMER && !values.promote) {
    console.error("That is a customer account. Run again with --promote to make it an admin.");
    return 1;
  }
  if (existing?.email && existing.email !== email.data) {
    console.error(`That account signs in with ${existing.email}. Use that email to reset its password.`);
    return 1;
  }

  const entered = await readPassword();
  if (entered === null) {
    console.error("The passwords do not match.");
    return 1;
  }
  const password = passwordSchema.safeParse(entered);
  if (!password.success) {
    console.error(password.error.issues[0]?.message);
    return 1;
  }
  const passwordHash = await hashPassword(password.data);

  if (!existing) {
    await prisma.user.create({ data: { phone: phone!.data!, email: email.data, name, passwordHash, role: UserRole.ADMIN } });
    console.log(`Created admin ${email.data}.`);
  } else {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: UserRole.ADMIN, email: email.data, passwordHash, ...(name && { name }) },
    });
    console.log(existing.role === UserRole.ADMIN ? `Password set for admin ${email.data}.` : `Promoted ${email.data} to admin.`);
  }

  console.log("Sign in to the admin dashboard with this email and password.");
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

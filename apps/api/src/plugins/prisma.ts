import fp from "fastify-plugin";

import { prisma } from "../infrastructure/database/prisma.js";

export default fp(async (app) => {
  await prisma.$connect();

  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});

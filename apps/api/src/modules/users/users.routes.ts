import type { FastifyPluginAsync } from "fastify";

import { AppError } from "../../shared/errors.js";

const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: app.authenticate }, async (request) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, phone: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "User no longer exists");
    }

    return user;
  });
};

export default usersRoutes;

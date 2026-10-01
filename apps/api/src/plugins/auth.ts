import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import type { UserRole } from "../generated/prisma/client";
import { AppError } from "../shared/errors.js";

export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Missing or invalid access token");
    }
  });

  app.decorate("requireRole", (...roles: UserRole[]) => {
    return async (request: FastifyRequest) => {
      await app.authenticate(request);

      if (!roles.includes(request.user.role)) {
        throw new AppError(403, "FORBIDDEN", "You do not have access to this resource");
      }
    };
  });
});

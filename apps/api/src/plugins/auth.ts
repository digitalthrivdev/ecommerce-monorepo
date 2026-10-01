import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import { UserRole } from "../generated/prisma/client";
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

  app.decorate("tryAuthenticate", async (request: FastifyRequest) => {
    if (!request.headers.authorization) {
      return false;
    }

    try {
      await request.jwtVerify();
      return true;
    } catch {
      return false;
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

  // Staff membership is read from the database so removing someone from a store takes effect immediately.
  app.decorate("canManageStore", async (request: FastifyRequest, storeId: string) => {
    if (request.user.role === UserRole.ADMIN) {
      return true;
    }
    if (request.user.role !== UserRole.STORE_STAFF) {
      return false;
    }

    const user = await app.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { role: true, storeId: true },
    });

    return user?.role === UserRole.STORE_STAFF && user.storeId === storeId;
  });

  app.decorate("requireStoreAccess", async (request: FastifyRequest) => {
    await app.authenticate(request);

    const { storeId } = request.params as { storeId?: string };

    if (!storeId || !(await app.canManageStore(request, storeId))) {
      throw new AppError(403, "FORBIDDEN", "You do not have access to this store");
    }
  });
});

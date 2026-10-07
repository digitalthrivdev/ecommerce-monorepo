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

  // A revocation only needs to outlive the tokens it rejects.
  const probe = app.jwt.decode<{ iat: number; exp: number }>(app.jwt.sign({ sub: "probe", role: UserRole.CUSTOMER }));
  const tokenLifetimeSeconds = probe ? probe.exp - probe.iat : 30 * 24 * 3600;
  const revokedKey = (userId: string) => `auth:revoked:${userId}`;
  const revokedTokenKey = (tokenId: string) => `auth:revoked-token:${tokenId}`;

  /**
   * Whether the token is valid, not signed out, and issued after the user's last revocation. A Redis failure
   * throws instead of returning false, so an outage does not sign every app user out.
   */
  async function verify(request: FastifyRequest) {
    try {
      await request.jwtVerify();
    } catch {
      return false;
    }
    const { sub, iat, jti } = request.user;
    const [revokedAt, signedOut] = await app.redis.mget(jti ? [revokedKey(sub), revokedTokenKey(jti)] : [revokedKey(sub)]);
    return !(revokedAt && iat <= Number(revokedAt)) && !signedOut;
  }

  app.decorate("revokeTokens", async (userId: string) => {
    await app.redis.set(revokedKey(userId), String(Math.floor(Date.now() / 1000)), "EX", tokenLifetimeSeconds + 60);
  });

  app.decorate("revokeToken", async (user: FastifyRequest["user"]) => {
    if (!user.jti) {
      await app.revokeTokens(user.sub);
      return;
    }
    const secondsLeft = Math.max(user.exp - Math.floor(Date.now() / 1000), 0);
    await app.redis.set(revokedTokenKey(user.jti), "1", "EX", secondsLeft + 60);
  });

  app.decorate("authenticate", async (request: FastifyRequest) => {
    if (!(await verify(request))) {
      throw new AppError(401, "UNAUTHORIZED", "Missing or invalid access token");
    }
  });

  app.decorate("tryAuthenticate", async (request: FastifyRequest) => {
    return Boolean(request.headers.authorization) && (await verify(request));
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

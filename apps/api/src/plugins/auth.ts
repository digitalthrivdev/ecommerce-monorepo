import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyRequest } from "fastify";

import { env } from "../config/env.js";
import { UserRole } from "../generated/prisma/client";
import { AppError } from "../shared/errors.js";
import { revokedTokensKey as revokedKey } from "../shared/token-revocation.js";

export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  // A revocation only needs to outlive the tokens it rejects.
  const probe = app.jwt.decode<{ iat: number; exp: number }>(app.jwt.sign({ sub: "probe", role: UserRole.CUSTOMER }));
  const tokenLifetimeSeconds = probe ? probe.exp - probe.iat : 30 * 24 * 3600;
  const revokedTokenKey = (tokenId: string) => `auth:revoked-token:${tokenId}`;

  const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  // The demo's order flow: packing, and tracking a manually shipped order. Booking with a carrier
  // is left out, since a real carrier would charge for it.
  const TEST_ADMIN_WRITES = new Set([
    "/auth/logout",
    "/admin/orders/:orderId/items/:itemId/unavailable",
    "/admin/orders/:orderId/pack",
    "/admin/orders/:orderId/shipment/events",
  ]);
  const testAccountError = () => new AppError(403, "TEST_ACCOUNT_READ_ONLY", "Demo account: changes are disabled");

  /** A test admin (demo login) can look at everything but change nothing, apart from signing out and running the order flow. */
  function assertNotReadOnly(request: FastifyRequest) {
    const { role, test } = request.user;
    if (test && role === UserRole.ADMIN && !READ_METHODS.has(request.method) && !TEST_ADMIN_WRITES.has(request.routeOptions.url ?? "")) {
      throw testAccountError();
    }
  }

  app.decorate("forbidTestAccount", async (request: FastifyRequest) => {
    if (!request.user) {
      throw new AppError(401, "UNAUTHORIZED", "Please sign in to continue");
    }
    if (request.user.test) {
      throw testAccountError();
    }
  });

  /**
   * Whether the token is valid, not signed out, and issued after the user's last revocation. A Redis failure
   * throws instead of returning false, so an outage does not sign every app user out. Every authenticated
   * request passes here, so it also enforces the read-only test admin.
   */
  async function verify(request: FastifyRequest) {
    try {
      await request.jwtVerify();
    } catch {
      return false;
    }
    const { sub, iat, jti } = request.user;
    const [revokedAt, signedOut] = await app.redis.mget(jti ? [revokedKey(sub), revokedTokenKey(jti)] : [revokedKey(sub)]);
    if ((revokedAt && iat <= Number(revokedAt)) || signedOut) {
      return false;
    }
    assertNotReadOnly(request);
    return true;
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
      throw new AppError(401, "UNAUTHORIZED", "Please sign in to continue");
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
});

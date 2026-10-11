import type { FastifyRequest } from "fastify";
import type { PrismaClient, UserRole } from "../generated/prisma/client";
import type Redis from "ioredis";
import type { OtpRegistry } from "../modules/auth/otp-registry.js";
import type { NotificationsService } from "../modules/notifications/notifications.service.js";
import type { PaymentsService } from "../modules/payments/payments.service.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    payments: PaymentsService;
    otp: OtpRegistry;
    notifications: NotificationsService;
    authenticate: (request: FastifyRequest) => Promise<void>;
    tryAuthenticate: (request: FastifyRequest) => Promise<boolean>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest) => Promise<void>;
    canManageStore: (request: FastifyRequest, storeId: string) => Promise<boolean>;
    requireStoreAccess: (request: FastifyRequest) => Promise<void>;
    /** Refuses test accounts (demo logins). Runs after the route's authentication, so list it after that guard. */
    forbidTestAccount: (request: FastifyRequest) => Promise<void>;
    /** Rejects every token issued to the user until now, e.g. after the account is deleted. */
    revokeTokens: (userId: string) => Promise<void>;
    /** Rejects one token (sign-out on one device); other devices stay signed in. */
    revokeToken: (user: FastifyRequest["user"]) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    /** `test` is set only for test accounts (`User.isTestAccount`). */
    payload: { sub: string; role: UserRole; test?: true; jti?: string };
    /** `iat` and `exp` are set by the signer, in seconds. Tokens issued before sign-out existed have no `jti`. */
    user: { sub: string; role: UserRole; test?: true; iat: number; exp: number; jti?: string };
  }
}

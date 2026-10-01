import type { FastifyRequest } from "fastify";
import type { PrismaClient, UserRole } from "../generated/prisma/client";
import type Redis from "ioredis";
import type { NotificationsService } from "../modules/notifications/notifications.service.js";
import type { PaymentsService } from "../modules/payments/payments.service.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    payments: PaymentsService;
    notifications: NotificationsService;
    authenticate: (request: FastifyRequest) => Promise<void>;
    tryAuthenticate: (request: FastifyRequest) => Promise<boolean>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest) => Promise<void>;
    canManageStore: (request: FastifyRequest, storeId: string) => Promise<boolean>;
    requireStoreAccess: (request: FastifyRequest) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole };
    user: { sub: string; role: UserRole };
  }
}

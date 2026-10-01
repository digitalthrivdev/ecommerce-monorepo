import type { FastifyRequest } from "fastify";
import type { PrismaClient, UserRole } from "../generated/prisma/client";
import type Redis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    authenticate: (request: FastifyRequest) => Promise<void>;
    tryAuthenticate: (request: FastifyRequest) => Promise<boolean>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole };
    user: { sub: string; role: UserRole };
  }
}

import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { createCashService, type Recorder } from "./cash.service.js";
import {
  cashDepositParamsSchema,
  cashPartnerParamsSchema,
  depositsQuerySchema,
  listCashQuerySchema,
  recordDepositBodySchema,
  voidDepositBodySchema,
} from "./delivery.schemas.js";

/** Riders' cash in hand, for admins and store staff who receive their deposits. */
const cashRoutes: FastifyPluginAsync = async (app) => {
  const cash = createCashService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN, UserRole.STORE_STAFF));

  // Staff membership is read from the database so removing someone from a store takes effect immediately.
  async function recorder(request: FastifyRequest): Promise<Recorder> {
    if (request.user.role === UserRole.ADMIN) {
      return { userId: request.user.sub, storeId: null };
    }
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { role: true, storeId: true },
    });
    if (user?.role !== UserRole.STORE_STAFF || !user.storeId) {
      throw new AppError(403, "FORBIDDEN", "You are not assigned to a store");
    }
    return { userId: request.user.sub, storeId: user.storeId };
  }

  app.get("/", async (request) => {
    await recorder(request);
    return cash.listPartners(listCashQuerySchema.parse(request.query));
  });

  app.get("/:partnerId", async (request) => {
    await recorder(request);
    const { partnerId } = cashPartnerParamsSchema.parse(request.params);
    return cash.getPartner(partnerId);
  });

  app.get("/:partnerId/deposits", async (request) => {
    await recorder(request);
    const { partnerId } = cashPartnerParamsSchema.parse(request.params);
    const query = depositsQuerySchema.parse(request.query);
    await cash.requirePartner(partnerId);
    return cash.listDeposits(partnerId, query);
  });

  app.post("/:partnerId/deposits", async (request, reply) => {
    const by = await recorder(request);
    const { partnerId } = cashPartnerParamsSchema.parse(request.params);
    const body = recordDepositBodySchema.parse(request.body);
    return reply.status(201).send(await cash.recordDeposit(partnerId, body, by));
  });

  app.post("/deposits/:depositId/void", { preHandler: app.requireRole(UserRole.ADMIN) }, async (request) => {
    const { depositId } = cashDepositParamsSchema.parse(request.params);
    const { reason } = voidDepositBodySchema.parse(request.body);
    return cash.voidDeposit(depositId, reason, request.user.sub);
  });
};

export default cashRoutes;

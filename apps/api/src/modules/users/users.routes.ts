import type { FastifyPluginAsync } from "fastify";

import { Prisma, UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { idParamsSchema } from "../../shared/schemas.js";
import { createAddressBodySchema, updateAddressBodySchema } from "./addresses.schemas.js";
import { createAddressesService } from "./addresses.service.js";
import { updateProfileBodySchema } from "./users.schemas.js";

const meSelect = {
  id: true,
  phone: true,
  name: true,
  email: true,
  role: true,
  store: { select: { id: true, name: true, code: true } },
} satisfies Prisma.UserSelect;

const usersRoutes: FastifyPluginAsync = async (app) => {
  const addressesService = createAddressesService(app.prisma);
  const requireCustomer = app.requireRole(UserRole.CUSTOMER);

  app.get("/me", { preHandler: app.authenticate }, async (request) => {
    const user = await app.prisma.user.findUnique({ where: { id: request.user.sub }, select: meSelect });

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "User no longer exists");
    }

    return user;
  });

  // Staff and partner names are managed by admins.
  app.patch("/me", { preHandler: requireCustomer }, async (request) => {
    const body = updateProfileBodySchema.parse(request.body);
    try {
      return await app.prisma.user.update({ where: { id: request.user.sub }, data: body, select: meSelect });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "EMAIL_IN_USE", "Another account already uses this email");
      }
      throw error;
    }
  });

  app.get("/me/addresses", { preHandler: requireCustomer }, async (request) => {
    return { items: await addressesService.listAddresses(request.user.sub) };
  });

  app.post("/me/addresses", { preHandler: requireCustomer }, async (request, reply) => {
    const body = createAddressBodySchema.parse(request.body);
    const address = await addressesService.createAddress(request.user.sub, body);
    return reply.status(201).send(address);
  });

  app.patch("/me/addresses/:id", { preHandler: requireCustomer }, async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = updateAddressBodySchema.parse(request.body);
    return addressesService.updateAddress(request.user.sub, id, body);
  });

  app.delete("/me/addresses/:id", { preHandler: requireCustomer }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await addressesService.deleteAddress(request.user.sub, id);
    return reply.status(204).send();
  });
};

export default usersRoutes;

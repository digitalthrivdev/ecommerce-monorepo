import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { createAccountDeletionService } from "./account-deletion.js";
import { customerOrdersQuerySchema, listCustomersQuerySchema } from "./customers.schemas.js";
import { createCustomersService } from "./customers.service.js";

/** Customer views for admins. */
const customersRoutes: FastifyPluginAsync = async (app) => {
  const customers = createCustomersService(app.prisma);
  const accounts = createAccountDeletionService(app.prisma, app.revokeTokens);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => {
    const query = listCustomersQuerySchema.parse(request.query);
    return customers.listCustomers(query);
  });

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return customers.getCustomer(id);
  });

  app.get("/:id/orders", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const query = customerOrdersQuerySchema.parse(request.query);
    return customers.listOrders(id, query);
  });

  // For deletion requests that come by email or phone instead of through the app.
  app.delete("/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await accounts.deleteAccount(id, UserRole.CUSTOMER);
    return reply.status(204).send();
  });
};

export default customersRoutes;

import type { FastifyPluginAsync } from "fastify";

import { UserRole } from "../../generated/prisma/client";
import { idParamsSchema } from "../../shared/schemas.js";
import { customerOrdersQuerySchema, listCustomersQuerySchema } from "./customers.schemas.js";
import { createCustomersService } from "./customers.service.js";

/** Read-only customer views for admins. */
const customersRoutes: FastifyPluginAsync = async (app) => {
  const customers = createCustomersService(app.prisma);

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
};

export default customersRoutes;

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { UserRole } from "../../generated/prisma/client";
import { passwordSchema } from "../../shared/password.js";
import { emailSchema, phoneSchema } from "../../shared/schemas.js";
import { createStaffService } from "./staff.service.js";

const idSchema = z.string().trim().min(1).max(64);
const storeParamsSchema = z.object({ storeId: idSchema });
const staffParamsSchema = z.object({ storeId: idSchema, userId: idSchema });
const addStaffBodySchema = z.object({
  phone: phoneSchema,
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(100).optional(),
});
const setPasswordBodySchema = z.object({ password: passwordSchema });

const staffRoutes: FastifyPluginAsync = async (app) => {
  const staffService = createStaffService(app.prisma);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    return staffService.listStaff(storeId);
  });

  app.post("/", async (request, reply) => {
    const { storeId } = storeParamsSchema.parse(request.params);
    const body = addStaffBodySchema.parse(request.body);
    const { created, user } = await staffService.addStaff(storeId, body);
    return reply.status(created ? 201 : 200).send(user);
  });

  app.put("/:userId/password", async (request, reply) => {
    const { storeId, userId } = staffParamsSchema.parse(request.params);
    const { password } = setPasswordBodySchema.parse(request.body);
    await staffService.setStaffPassword(storeId, userId, password);
    return reply.status(204).send();
  });

  app.delete("/:userId", async (request, reply) => {
    const { storeId, userId } = staffParamsSchema.parse(request.params);
    await staffService.removeStaff(storeId, userId);
    return reply.status(204).send();
  });
};

export default staffRoutes;

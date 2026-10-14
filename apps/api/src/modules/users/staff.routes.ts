import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { UserRole } from "../../generated/prisma/client";
import { passwordSchema } from "../../shared/password.js";
import { emailSchema, phoneSchema } from "../../shared/schemas.js";
import { createStaffService } from "./staff.service.js";

const staffParamsSchema = z.object({ userId: z.string().trim().min(1).max(64) });
const addStaffBodySchema = z.object({
  phone: phoneSchema,
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(100).optional(),
});
const setPasswordBodySchema = z.object({ password: passwordSchema });

/** Dashboard staff accounts, managed by admins. Prefix: /staff */
const staffRoutes: FastifyPluginAsync = async (app) => {
  const staffService = createStaffService(app.prisma, app.revokeTokens);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async () => staffService.listStaff());

  app.post("/", async (request, reply) => {
    const body = addStaffBodySchema.parse(request.body);
    const { created, user } = await staffService.addStaff(body);
    return reply.status(created ? 201 : 200).send(user);
  });

  app.put("/:userId/password", async (request, reply) => {
    const { userId } = staffParamsSchema.parse(request.params);
    const { password } = setPasswordBodySchema.parse(request.body);
    await staffService.setStaffPassword(userId, password);
    return reply.status(204).send();
  });

  app.delete("/:userId", async (request, reply) => {
    const { userId } = staffParamsSchema.parse(request.params);
    await staffService.removeStaff(userId);
    return reply.status(204).send();
  });
};

export default staffRoutes;

import multipart from "@fastify/multipart";
import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { idParamsSchema } from "../../shared/schemas.js";
import { publicBaseUrl } from "../payments/public-url.js";
import { createImageStore, MAX_UPLOAD_BYTES, smallImagePath } from "../uploads/image-store.js";
import {
  complaintRefundBodySchema,
  createComplaintBodySchema,
  listComplaintsQuerySchema,
  resolveComplaintBodySchema,
} from "./complaints.schemas.js";
import { createComplaintsService } from "./complaints.service.js";

const PHOTO_UPLOADS_PER_HOUR = 10;

function complaintsService(app: Parameters<FastifyPluginAsync>[0]) {
  const images = createImageStore(env.UPLOADS_DIR);
  return { images, service: createComplaintsService(app.prisma, app.payments, app.notifications.notify, images.root) };
}

/** A customer reporting a problem with a delivered order. Prefix: /orders/:id/complaint */
export const customerComplaintsRoutes: FastifyPluginAsync = async (app) => {
  const { images, service } = complaintsService(app);

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  app.addHook("preHandler", app.requireRole(UserRole.CUSTOMER));

  app.post("/", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = createComplaintBodySchema.parse(request.body);
    await service.createComplaint(request.user.sub, id, body, `${publicBaseUrl(request)}/uploads/`);
    return reply.status(201).send({ ok: true });
  });

  /** Upload one photo at a time, then send the returned URLs with the complaint. */
  app.post("/photos", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await service.assertCanReport(request.user.sub, id);

    const key = `complaint-photos:${request.user.sub}`;
    const [[, count]] = (await app.redis.multi().incr(key).expire(key, 3600, "NX").exec()) as [[null, number]];
    if (count > PHOTO_UPLOADS_PER_HOUR) {
      throw new AppError(429, "TOO_MANY_UPLOADS", "Too many photos uploaded. Try again later.");
    }

    const file = await request.file();
    if (!file) {
      throw new AppError(400, "FILE_REQUIRED", "Choose a photo to upload");
    }
    let input: Buffer;
    try {
      input = await file.toBuffer();
    } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
        throw new AppError(413, "FILE_TOO_LARGE", `Photos can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
      }
      throw error;
    }

    const saved = await images.saveImage(input);
    const base = `${publicBaseUrl(request)}/uploads/`;
    return reply.status(201).send({ url: base + saved.key, smallUrl: base + smallImagePath(saved.key) });
  });
};

/** Complaints for admins. Prefix: /admin/complaints */
export const adminComplaintsRoutes: FastifyPluginAsync = async (app) => {
  const { service } = complaintsService(app);

  app.addHook("preHandler", app.requireRole(UserRole.ADMIN));

  app.get("/", async (request) => service.listComplaints(listComplaintsQuerySchema.parse(request.query)));

  app.get("/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.getComplaint(id);
  });

  app.post("/:id/refund", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.refundComplaint(id, complaintRefundBodySchema.parse(request.body), request.user.sub);
  });

  app.post("/:id/resolve", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.resolveComplaint(id, resolveComplaintBodySchema.parse(request.body), request.user.sub);
  });
};
import { mkdir } from "node:fs/promises";

import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { FastifyPluginAsync } from "fastify";

import { env } from "../../config/env.js";
import { UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { publicBaseUrl } from "../payments/public-url.js";
import { createImageStore, MAX_UPLOAD_BYTES, smallImagePath } from "./image-store.js";

const ONE_YEAR_SECONDS = 31_536_000;

const uploadsRoutes: FastifyPluginAsync = async (app) => {
  const store = createImageStore(env.UPLOADS_DIR);
  await mkdir(store.root, { recursive: true });

  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // Production traffic for these files is answered by Nginx; this serves development and fallbacks.
  await app.register(fastifyStatic, {
    root: store.root,
    prefix: "/uploads/",
    index: false,
    maxAge: ONE_YEAR_SECONDS * 1000,
    immutable: true,
    setHeaders: (reply) => {
      // The dashboard and apps load these from other origins.
      reply.header("Cross-Origin-Resource-Policy", "cross-origin");
    },
  });

  app.post("/images", { preHandler: app.requireRole(UserRole.ADMIN, UserRole.STORE_STAFF) }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw new AppError(400, "FILE_REQUIRED", "Choose an image to upload");
    }

    let input: Buffer;
    try {
      input = await file.toBuffer();
    } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
        throw new AppError(413, "FILE_TOO_LARGE", `Images can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
      }
      throw error;
    }

    const saved = await store.saveImage(input);
    const base = `${publicBaseUrl(request)}/uploads/`;
    return reply.status(201).send({
      url: base + saved.key,
      smallUrl: base + smallImagePath(saved.key),
      width: saved.width,
      height: saved.height,
      bytes: saved.bytes,
    });
  });
};

export default uploadsRoutes;

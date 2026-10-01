import fp from "fastify-plugin";
import type { FastifyError } from "fastify";
import { ZodError } from "zod";

import { AppError } from "../shared/errors.js";

export default fp(async (app) => {
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: "NOT_FOUND",
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error(error);
      return reply.status(statusCode).send({
        error: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      });
    }

    return reply.status(statusCode).send({
      error: error.code ?? "REQUEST_ERROR",
      message: error.message,
    });
  });
});

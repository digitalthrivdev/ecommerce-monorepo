import type { FastifyRequest } from "fastify";

import { env } from "../../config/env.js";

/** The API's address as customers' browsers and gateways reach it. Required to be set in production. */
export function publicBaseUrl(request: FastifyRequest) {
  return (env.PUBLIC_API_URL ?? `${request.protocol}://${request.host}`).replace(/\/+$/, "");
}

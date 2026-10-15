import type { FastifyPluginAsync } from "fastify";
import { PINCODE_PATTERN } from "@shop/validation";
import { z } from "zod";

import { booleanQuery } from "../../shared/schemas.js";
import { createServiceabilityService } from "./serviceability.service.js";

const serviceabilityQuerySchema = z.object({
  pincode: z.string().trim().regex(PINCODE_PATTERN, "Enter the 6-digit PIN code"),
  /** The order's total weight, for the carrier's answer; 0 when it is not known yet. */
  weightGrams: z.coerce.number().int().min(0).max(1_000_000).default(0),
  /** Ask whether cash on delivery is available at this pincode. */
  cod: booleanQuery,
});

/** Public pincode check for the product page and checkout, using the active carrier. */
const serviceabilityRoutes: FastifyPluginAsync = async (app) => {
  const serviceability = createServiceabilityService(app.prisma);

  app.get("/", async (request) => {
    const { pincode, weightGrams, cod } = serviceabilityQuerySchema.parse(request.query);
    return { pincode, ...(await serviceability.check({ pincode, weightGrams, cod })) };
  });
};

export default serviceabilityRoutes;

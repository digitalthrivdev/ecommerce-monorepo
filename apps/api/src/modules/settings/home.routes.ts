import type { FastifyPluginAsync } from "fastify";

import { homeQuerySchema } from "./appearance.schemas.js";
import { createHomeService } from "./home.service.js";

const homeRoutes: FastifyPluginAsync = async (app) => {
  const home = createHomeService(app.prisma);

  // Public, like GET /settings: the customer app renders the home screen from it.
  app.get("/", async (request) => {
    const { storeId } = homeQuerySchema.parse(request.query);
    return home.getHomeFeed(storeId);
  });
};

export default homeRoutes;

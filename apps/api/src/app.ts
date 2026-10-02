import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import notificationsPlugin from "./plugins/notifications.js";
import otpPlugin from "./plugins/otp.js";
import paymentsPlugin from "./plugins/payments.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import authRoutes from "./modules/auth/auth.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import categoriesRoutes from "./modules/categories/categories.routes.js";
import deliveryRoutes from "./modules/delivery/delivery.routes.js";
import partnersRoutes from "./modules/delivery/partners.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import adminOrdersRoutes from "./modules/orders/admin-orders.routes.js";
import dashboardRoutes from "./modules/orders/dashboard.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import paymentsRoutes from "./modules/payments/payments.routes.js";
import storeOrdersRoutes from "./modules/orders/store-orders.routes.js";
import { productsRoutes, storeProductsRoutes } from "./modules/products/products.routes.js";
import homeRoutes from "./modules/settings/home.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import staffRoutes from "./modules/stores/staff.routes.js";
import storesRoutes from "./modules/stores/stores.routes.js";
import customersRoutes from "./modules/users/customers.routes.js";
import usersRoutes from "./modules/users/users.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors);
  await app.register(helmet);
  await app.register(errorHandlerPlugin);

  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(otpPlugin);
  await app.register(paymentsPlugin);
  await app.register(notificationsPlugin);

  app.get("/health", async () => {
    await app.prisma.$queryRaw`SELECT 1`;

    const redisStatus = await app.redis.ping();

    return {
      status: "ok",
      service: "grocery-api",
      database: "ok",
      redis: redisStatus === "PONG" ? "ok" : "error",
    };
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(storesRoutes, { prefix: "/stores" });
  await app.register(categoriesRoutes, { prefix: "/categories" });
  await app.register(productsRoutes, { prefix: "/products" });
  await app.register(storeProductsRoutes, { prefix: "/stores/:storeId/products" });
  await app.register(inventoryRoutes, { prefix: "/stores/:storeId/inventory" });
  await app.register(cartRoutes, { prefix: "/cart" });
  await app.register(ordersRoutes, { prefix: "/orders" });
  await app.register(paymentsRoutes, { prefix: "/payments" });
  await app.register(staffRoutes, { prefix: "/stores/:storeId/staff" });
  await app.register(storeOrdersRoutes, { prefix: "/stores/:storeId/orders" });
  await app.register(adminOrdersRoutes, { prefix: "/admin/orders" });
  await app.register(customersRoutes, { prefix: "/admin/customers" });
  await app.register(partnersRoutes, { prefix: "/delivery-partners" });
  await app.register(deliveryRoutes, { prefix: "/delivery" });
  await app.register(settingsRoutes, { prefix: "/settings" });
  await app.register(homeRoutes, { prefix: "/home" });
  await app.register(notificationsRoutes, { prefix: "/notifications" });
  await app.register(dashboardRoutes, { prefix: "/dashboard" });

  return app;
}

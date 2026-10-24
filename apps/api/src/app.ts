import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { env } from "./config/env.js";
import { reportLoggedError } from "./infrastructure/error-reporting.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import notificationsPlugin from "./plugins/notifications.js";
import otpPlugin from "./plugins/otp.js";
import paymentsPlugin from "./plugins/payments.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import shippingPlugin from "./plugins/shipping.js";
import authRoutes from "./modules/auth/auth.routes.js";
import brandsRoutes from "./modules/brands/brands.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import catalogImportRoutes from "./modules/catalog-import/catalog-import.routes.js";
import categoriesRoutes from "./modules/categories/categories.routes.js";
import { adminComplaintsRoutes, customerComplaintsRoutes } from "./modules/complaints/complaints.routes.js";
import adminCouponsRoutes from "./modules/coupons/coupons.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import { dashboardInvoiceRoutes, invoiceLinkRoutes } from "./modules/invoices/invoices.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import adminOrdersRoutes from "./modules/orders/admin-orders.routes.js";
import dashboardRoutes from "./modules/orders/dashboard.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import paymentsRoutes from "./modules/payments/payments.routes.js";
import {
  catalogBrandsRoutes,
  catalogProductsRoutes,
  productsRoutes,
  variantsRoutes,
} from "./modules/products/products.routes.js";
import { adminRatingsRoutes, customerRatingsRoutes } from "./modules/ratings/ratings.routes.js";
import { adminReviewsRoutes, orderReviewsRoutes, productReviewsRoutes } from "./modules/reviews/reviews.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import homeRoutes from "./modules/settings/home.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import pickupLocationsRoutes from "./modules/shipping/pickup-locations.routes.js";
import serviceabilityRoutes from "./modules/shipping/serviceability.routes.js";
import shippingWebhooksRoutes from "./modules/shipping/shipping-webhooks.routes.js";
import uploadsRoutes from "./modules/uploads/uploads.routes.js";
import customersRoutes from "./modules/users/customers.routes.js";
import staffRoutes from "./modules/users/staff.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import wishlistRoutes from "./modules/wishlist/wishlist.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      hooks: {
        logMethod(args, method, level) {
          if (level >= 50) reportLoggedError(args);
          return method.apply(this, args);
        },
      },
    },
    trustProxy:
      typeof env.TRUST_PROXY === "number"
        ? (_address: string, hop: number) => hop < (env.TRUST_PROXY as number)
        : env.TRUST_PROXY,
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
  await app.register(shippingPlugin);

  app.get("/health", async () => {
    await app.prisma.$queryRaw`SELECT 1`;

    const redisStatus = await app.redis.ping();

    return {
      status: "ok",
      service: "shop-api",
      database: "ok",
      redis: redisStatus === "PONG" ? "ok" : "error",
    };
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(categoriesRoutes, { prefix: "/categories" });
  await app.register(brandsRoutes, { prefix: "/brands" });
  await app.register(productsRoutes, { prefix: "/products" });
  await app.register(productReviewsRoutes, { prefix: "/products" });
  await app.register(catalogImportRoutes, { prefix: "/catalog-imports" });
  await app.register(catalogProductsRoutes, { prefix: "/catalog/products" });
  await app.register(catalogBrandsRoutes, { prefix: "/catalog/brands" });
  await app.register(variantsRoutes, { prefix: "/variants" });
  await app.register(inventoryRoutes, { prefix: "/inventory" });
  await app.register(cartRoutes, { prefix: "/cart" });
  await app.register(wishlistRoutes, { prefix: "/wishlist" });
  await app.register(ordersRoutes, { prefix: "/orders" });
  await app.register(customerComplaintsRoutes, { prefix: "/orders/:id/returns" });
  await app.register(customerRatingsRoutes, { prefix: "/orders/:id/rating" });
  await app.register(orderReviewsRoutes, { prefix: "/orders/:id/reviews" });
  await app.register(paymentsRoutes, { prefix: "/payments" });
  await app.register(staffRoutes, { prefix: "/staff" });
  await app.register(pickupLocationsRoutes, { prefix: "/pickup-locations" });
  await app.register(serviceabilityRoutes, { prefix: "/serviceability" });
  await app.register(shippingWebhooksRoutes, { prefix: "/shipping" });
  await app.register(adminOrdersRoutes, { prefix: "/admin/orders" });
  await app.register(dashboardInvoiceRoutes, { prefix: "/admin/orders" });
  await app.register(invoiceLinkRoutes, { prefix: "/invoices" });
  await app.register(reportsRoutes, { prefix: "/admin/reports" });
  await app.register(customersRoutes, { prefix: "/admin/customers" });
  await app.register(adminComplaintsRoutes, { prefix: "/admin/returns" });
  await app.register(adminRatingsRoutes, { prefix: "/admin/ratings" });
  await app.register(adminReviewsRoutes, { prefix: "/admin/reviews" });
  await app.register(adminCouponsRoutes, { prefix: "/admin/coupons" });
  await app.register(settingsRoutes, { prefix: "/settings" });
  await app.register(homeRoutes, { prefix: "/home" });
  await app.register(notificationsRoutes, { prefix: "/notifications" });
  await app.register(dashboardRoutes, { prefix: "/dashboard" });
  await app.register(uploadsRoutes);

  return app;
}

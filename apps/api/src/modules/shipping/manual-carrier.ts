import { ShipmentStatus } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { ShippingProvider } from "./shipping-provider.js";

/**
 * The admin books the courier themselves and types the courier name, AWB and tracking URL. The
 * parcel counts as handed over when it is recorded, and the admin records later progress by hand.
 * Every pincode is served.
 */
export const manualCarrier: ShippingProvider = {
  name: "manual",
  label: "Manual",
  testMode: false,
  reportsTracking: false,

  async checkServiceability() {
    return { serviceable: true, codAvailable: true, etaDays: null };
  },

  async createShipment(input) {
    if (!input.manual) {
      throw new AppError(400, "COURIER_DETAILS_REQUIRED", "Enter the courier name and AWB number", { field: "awb" });
    }
    return {
      providerOrderId: null,
      providerShipmentId: null,
      awb: input.manual.awb,
      courierName: input.manual.courierName,
      trackingUrl: input.manual.trackingUrl,
      status: ShipmentStatus.PICKED_UP,
    };
  },

  async assignAwb(shipment) {
    return { awb: shipment.awb ?? "", courierName: null, trackingUrl: null };
  },

  async schedulePickup() {
    return { status: ShipmentStatus.PICKED_UP };
  },

  async getLabel() {
    return null;
  },

  async track() {
    return [];
  },

  async cancelShipment() {},

  parseWebhook() {
    return null;
  },

  async checkCredentials() {
    return true;
  },
};

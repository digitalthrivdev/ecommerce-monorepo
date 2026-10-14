import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "../src/generated/prisma/client";
import { redis } from "../src/infrastructure/redis/client.js";
import {
  createShiprocketProvider,
  mapShiprocketStatus,
  SHIPROCKET_WEBHOOK_HEADER,
} from "../src/modules/shipping/shiprocket-carrier.js";
import type { ShipmentInput } from "../src/modules/shipping/shipping-provider.js";

/**
 * Records live Shiprocket v2 responses so the provider is exercised without a real API call. The
 * token cache is mocked, so this suite needs no Redis.
 */
const { tokenStore } = vi.hoisted(() => ({ tokenStore: new Map<string, string>() }));

vi.mock("../src/infrastructure/redis/client.js", () => ({
  redis: {
    get: vi.fn(async (key: string) => tokenStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      tokenStore.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      tokenStore.delete(key);
      return 1;
    }),
  },
}));

const CREDENTIALS = {
  email: "api@shiprocket.test",
  password: "shiprocket-secret",
  webhookToken: "webhook-token-123",
  pickupLocation: "Main Warehouse",
};
const TOKEN_KEY = `shiprocket:token:${CREDENTIALS.email}`;

// Recorded samples (fields trimmed to the ones the provider reads).
const LOGIN = { id: 1234, first_name: "API", token: "sr.test.token", created_at: "2026-03-01 10:00:00" };
const SERVICEABILITY = {
  data: {
    available_courier_companies: [
      { courier_company_id: 10, courier_name: "Delhivery Surface", estimated_delivery_days: "4", cod: 1, rate: 45.5 },
      { courier_company_id: 142, courier_name: "XpressBees", estimated_delivery_days: "3", cod: 0, rate: 60 },
    ],
  },
};
const SERVICEABILITY_NO_COD = {
  data: { available_courier_companies: [{ courier_company_id: 142, courier_name: "XpressBees", estimated_delivery_days: "3", cod: 0 }] },
};
const CREATE_ORDER = { order_id: 16161616, shipment_id: 15151515, status: "NEW", status_code: 1, awb_code: null, courier_company_id: null, courier_name: null };
const ASSIGN_AWB = {
  awb_assign_status: 1,
  response: { data: { awb_code: "321055706540", courier_company_id: 142, courier_name: "Amazon Surface", applied_weight: 0.5 } },
};
const PICKUP = { pickup_status: 1, response: { pickup_scheduled_date: "2026-03-13 12:00:00", pickup_token_number: "Reference No: 194" } };
const LABEL = { label_created: 1, label_url: "https://kr-shipmultichannel.s3.amazonaws.com/label.pdf" };
const TRACKING = {
  tracking_data: {
    track_status: 1,
    shipment_status: "IN TRANSIT",
    shipment_track_activities: [
      { date: "2026-03-10 06:00:00", status: "AWB ASSIGNED", activity: "Manifested", location: "Noida" },
      { date: "2026-03-11 08:00:00", status: "X-UCI", activity: "Scanned", location: "Noida Hub" },
      { date: "2026-03-12 09:35:00", status: "OUT FOR DELIVERY", activity: "OFD", location: "Mumbai_Hub" },
      { date: "2026-03-12 18:00:00", status: "DELIVERED", activity: "", location: "Mumbai" },
    ],
  },
};
const WEBHOOK_PICKED_UP = {
  awb: "SRBC0763219581",
  courier_name: "Ekart Shopdeck",
  current_status: "PICKED UP",
  current_status_id: 42,
  shipment_status: "PICKED UP",
  shipment_status_id: 42,
  current_timestamp: "07 09 2026 15:49:00",
  order_id: "PD8CWL6H32PPN2KPK4",
  sr_order_id: 1569076321,
  date: "2026-09-07 15:49:00",
  is_return: 0,
  scans: [
    { date: "2026-09-07 09:46:32", status: "created", activity: "", location: "MP_SuratHub_STV SURAT", "sr-status": 1, "sr-status-label": "AWB ASSIGNED" },
    { date: "2026-09-07 15:49:00", status: "shipment_pickup_complete", activity: "", location: "MotherHub_STV SURAT", "sr-status": 42, "sr-status-label": "PICKED UP" },
  ],
};
const WEBHOOK_RTO = {
  awb: "SRBC0763219581",
  current_status: "RTO INITIATED",
  current_status_id: 15,
  shipment_status: "RTO INITIATED",
  shipment_status_id: 9,
  current_timestamp: "09 09 2026 16:13:13",
  scans: [{ date: "2026-09-09 15:48:17", status: "created", activity: "", location: "", "sr-status": 9, "sr-status-label": "RTO INITIATED" }],
};

const SHIPMENT_INPUT: ShipmentInput = {
  orderNumber: "ORD-2026-0001",
  orderDate: new Date("2026-03-12T05:30:00Z"),
  pickup: {
    id: "pickup-1",
    name: "Warehouse",
    phone: "+919000000001",
    addressLine1: "Plot 5",
    addressLine2: "Sector 62",
    landmark: null,
    city: "Noida",
    state: "Uttar Pradesh",
    postalCode: "201301",
  },
  delivery: {
    name: "Asha Rao",
    phone: "+919812345678",
    addressLine1: "12 Marine Drive",
    addressLine2: null,
    landmark: "Near Churchgate",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400020",
  },
  items: [{ name: "Cotton Shirt (M)", sku: "SHIRT-M", hsn: "6109", quantity: 2, unitPrice: new Prisma.Decimal("499.00") }],
  codAmount: new Prisma.Decimal("0"),
  orderTotal: new Prisma.Decimal("998.00"),
  parcel: { weightGrams: 600, lengthCm: new Prisma.Decimal("25"), breadthCm: new Prisma.Decimal("18"), heightCm: new Prisma.Decimal("8") },
};

type Handler = (url: string, init?: RequestInit) => Response | undefined;

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

const callLog: { url: string; init?: RequestInit }[] = [];

/** Replaces global fetch, dispatching on the URL. Unmatched calls fail loudly. */
function stubFetch(handler: Handler) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    callLog.push({ url, init });
    const response = handler(url, init);
    if (!response) throw new Error(`No mock response for ${url}`);
    return response;
  });
  vi.stubGlobal("fetch", fn);
}

function provider() {
  return createShiprocketProvider(CREDENTIALS);
}

function withLogin(handler: Handler): Handler {
  return (url, init) => {
    if (url.includes("/auth/login")) return json(LOGIN);
    return handler(url, init);
  };
}

beforeEach(() => {
  tokenStore.clear();
  callLog.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("mapShiprocketStatus", () => {
  it("maps Shiprocket labels and ids to our shipment statuses", () => {
    expect(mapShiprocketStatus("AWB ASSIGNED")).toBe("AWB_ASSIGNED");
    expect(mapShiprocketStatus("PICKUP SCHEDULED")).toBe("PICKUP_SCHEDULED");
    expect(mapShiprocketStatus("MANIFEST GENERATED")).toBe("PICKUP_SCHEDULED");
    expect(mapShiprocketStatus("OUT FOR PICKUP")).toBe("PICKUP_SCHEDULED");
    expect(mapShiprocketStatus("PICKED UP")).toBe("PICKED_UP");
    expect(mapShiprocketStatus("IN TRANSIT")).toBe("IN_TRANSIT");
    expect(mapShiprocketStatus("OUT FOR DELIVERY")).toBe("OUT_FOR_DELIVERY");
    expect(mapShiprocketStatus("UNDELIVERED")).toBe("NDR");
    expect(mapShiprocketStatus("DELIVERED")).toBe("DELIVERED");
    expect(mapShiprocketStatus("RTO INITIATED")).toBe("RTO_IN_TRANSIT");
    expect(mapShiprocketStatus("RTO IN TRANSIT")).toBe("RTO_IN_TRANSIT");
    expect(mapShiprocketStatus("RTO DELIVERED")).toBe("RTO_DELIVERED");
    expect(mapShiprocketStatus("CANCELLED")).toBe("CANCELLED");
    expect(mapShiprocketStatus("LOST")).toBe("LOST");

    expect(mapShiprocketStatus(42)).toBe("PICKED_UP");
    expect(mapShiprocketStatus(9)).toBe("RTO_IN_TRANSIT");
    expect(mapShiprocketStatus(7)).toBe("DELIVERED");

    expect(mapShiprocketStatus("MISROUTED")).toBe("IN_TRANSIT");
    expect(mapShiprocketStatus("DELAYED")).toBeNull();
    expect(mapShiprocketStatus("Something new")).toBeNull();
    expect(mapShiprocketStatus(null)).toBeNull();
  });
});

describe("checkServiceability", () => {
  it("answers from Shiprocket's courier list", async () => {
    stubFetch(withLogin((url) => (url.includes("courier/serviceability") ? json(SERVICEABILITY) : undefined)));

    const result = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: true });
    expect(result).toEqual({ serviceable: true, codAvailable: true, etaDays: 3 });

    const request = callLog.find((call) => call.url.includes("courier/serviceability"))!;
    const params = new URL(request.url).searchParams;
    expect(params.get("pickup_postcode")).toBe("201301");
    expect(params.get("delivery_postcode")).toBe("400020");
    expect(params.get("cod")).toBe("1");
    expect(params.get("weight")).toBe("0.600");
  });

  it("reports no COD and no service when Shiprocket has no courier", async () => {
    stubFetch(withLogin((url) => {
      if (url.includes("courier/serviceability")) return json(SERVICEABILITY_NO_COD);
      return undefined;
    }));
    const noCod = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: false });
    expect(noCod).toEqual({ serviceable: true, codAvailable: false, etaDays: 3 });

    stubFetch(withLogin((url) => (url.includes("courier/serviceability") ? json({ data: { available_courier_companies: [] } }) : undefined)));
    const none = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: false });
    expect(none.serviceable).toBe(false);
  });
});

describe("booking a shipment", () => {
  it("creates the adhoc order and keeps the ids", async () => {
    stubFetch(withLogin((url) => (url.includes("orders/create/adhoc") ? json(CREATE_ORDER) : undefined)));

    const booked = await provider().createShipment(SHIPMENT_INPUT);
    expect(booked).toEqual({
      providerOrderId: "16161616",
      providerShipmentId: "15151515",
      awb: null,
      courierName: null,
      trackingUrl: null,
      status: "PENDING",
    });

    const request = callLog.find((call) => call.url.includes("orders/create/adhoc"))!;
    const body = JSON.parse(String(request.init?.body));
    expect(body).toMatchObject({
      order_id: "ORD-2026-0001",
      pickup_location: "Main Warehouse",
      billing_customer_name: "Asha Rao",
      billing_address: "12 Marine Drive, Near Churchgate",
      billing_city: "Mumbai",
      billing_pincode: "400020",
      billing_state: "Maharashtra",
      billing_country: "India",
      billing_phone: "9812345678",
      shipping_is_billing: true,
      payment_method: "Prepaid",
      sub_total: 998,
      length: 25,
      breadth: 18,
      height: 8,
      weight: 0.6,
      order_items: [{ name: "Cotton Shirt (M)", sku: "SHIRT-M", units: 2, selling_price: 499 }],
    });
  });

  it("assigns the AWB, schedules the pickup and fetches the label", async () => {
    stubFetch(withLogin((url) => {
      if (url.includes("courier/assign/awb")) return json(ASSIGN_AWB);
      if (url.includes("courier/generate/pickup")) return json(PICKUP);
      if (url.includes("courier/generate/label")) return json(LABEL);
      return undefined;
    }));
    const carrier = provider();
    const ref = { providerOrderId: "16161616", providerShipmentId: "15151515", awb: null };

    expect(await carrier.assignAwb(ref)).toEqual({
      awb: "321055706540",
      courierName: "Amazon Surface",
      trackingUrl: "https://shiprocket.co/tracking/321055706540",
    });
    expect(await carrier.schedulePickup(ref)).toEqual({ status: "PICKUP_SCHEDULED" });
    expect(await carrier.getLabel(ref)).toEqual({ labelUrl: "https://kr-shipmultichannel.s3.amazonaws.com/label.pdf" });
  });

  it("fails clearly when Shiprocket refuses the AWB", async () => {
    stubFetch(withLogin((url) => (url.includes("courier/assign/awb") ? json({ awb_assign_status: 0 }) : undefined)));
    await expect(provider().assignAwb({ providerOrderId: "1", providerShipmentId: "2", awb: null })).rejects.toMatchObject({
      code: "SHIPPING_AWB_FAILED",
    });
  });
});

describe("tracking and cancellation", () => {
  it("maps tracking activities and skips unknown ones", async () => {
    stubFetch(withLogin((url) => (url.includes("courier/track/awb/321055706540") ? json(TRACKING) : undefined)));
    const events = await provider().track({ providerOrderId: "16161616", providerShipmentId: "15151515", awb: "321055706540" });
    expect(events.map((event) => event.status)).toEqual(["AWB_ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]);
    expect(events[1]).toMatchObject({ location: "Mumbai_Hub", description: "OUT FOR DELIVERY · OFD" });
  });

  it("cancels through the Shiprocket order id", async () => {
    stubFetch(withLogin((url) => (url.includes("orders/cancel") ? json({ message: "Order cancelled" }) : undefined)));
    await expect(provider().cancelShipment({ providerOrderId: "16161616", providerShipmentId: "15151515", awb: "321055706540" })).resolves.toBeUndefined();

    const request = callLog.find((call) => call.url.includes("orders/cancel"))!;
    expect(new URL(request.url).pathname.endsWith("/orders/cancel")).toBe(true);
    expect(JSON.parse(String(request.init?.body))).toEqual({ ids: [16161616] });
  });
});

describe("webhooks", () => {
  it("verifies the x-api-key token and maps the status", () => {
    const carrier = provider();
    const headers = { [SHIPROCKET_WEBHOOK_HEADER]: CREDENTIALS.webhookToken };

    const pickedUp = carrier.parseWebhook(JSON.stringify(WEBHOOK_PICKED_UP), headers);
    expect(pickedUp).toMatchObject({
      type: "event",
      awb: "SRBC0763219581",
      providerShipmentId: null,
      event: { status: "PICKED_UP", location: "MotherHub_STV SURAT", description: "PICKED UP" },
    });
    if (pickedUp?.type === "event") {
      expect(pickedUp.event.occurredAt.toISOString()).toBe("2026-09-07T10:19:00.000Z");
    }

    expect(carrier.parseWebhook(JSON.stringify(WEBHOOK_RTO), headers)).toMatchObject({ type: "event", event: { status: "RTO_IN_TRANSIT" } });
  });

  it("rejects a bad token and ignores unusable bodies", () => {
    const carrier = provider();
    expect(carrier.parseWebhook(JSON.stringify(WEBHOOK_PICKED_UP), { [SHIPROCKET_WEBHOOK_HEADER]: "wrong" })).toBeNull();
    expect(carrier.parseWebhook(JSON.stringify(WEBHOOK_PICKED_UP), {})).toBeNull();

    const headers = { [SHIPROCKET_WEBHOOK_HEADER]: CREDENTIALS.webhookToken };
    expect(carrier.parseWebhook("not json", headers)).toEqual({ type: "ignored" });
    expect(carrier.parseWebhook(JSON.stringify({ current_status: "IN TRANSIT" }), headers)).toEqual({ type: "ignored" });
    expect(carrier.parseWebhook(JSON.stringify({ awb: "X", current_status: "DELAYED" }), headers)).toEqual({ type: "ignored" });
  });
});

describe("authentication", () => {
  it("caches the token until it expires and reuses it", async () => {
    stubFetch(withLogin((url) => (url.includes("courier/serviceability") ? json(SERVICEABILITY) : undefined)));
    const email = `cache-${Date.now()}@shiprocket.test`;
    const carrier = createShiprocketProvider({ ...CREDENTIALS, email });

    await carrier.checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: false });
    await carrier.checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: false });

    expect(callLog.filter((call) => call.url.includes("/auth/login"))).toHaveLength(1);
    expect(redis.set).toHaveBeenCalledWith(`shiprocket:token:${email}`, "sr.test.token", "EX", 9 * 24 * 60 * 60);
  });

  it("re-logs in once when a cached token is rejected", async () => {
    tokenStore.set(TOKEN_KEY, "stale-token");
    stubFetch(withLogin((url, init) => {
      if (!url.includes("courier/serviceability")) return undefined;
      return (init?.headers as Record<string, string>)?.authorization === "Bearer stale-token" ? json({ message: "Unauthorized" }, 401) : json(SERVICEABILITY);
    }));

    const result = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: false });
    expect(result.serviceable).toBe(true);
    expect(callLog.filter((call) => call.url.includes("/auth/login"))).toHaveLength(1);
    expect(tokenStore.get(TOKEN_KEY)).toBe("sr.test.token");
  });

  it("reports whether the credentials work", async () => {
    stubFetch((url) => (url.includes("/auth/login") ? json(LOGIN) : undefined));
    expect(await provider().checkCredentials()).toBe(true);

    stubFetch((url) => (url.includes("/auth/login") ? json({ message: "Invalid credentials" }, 401) : undefined));
    expect(await provider().checkCredentials()).toBe(false);
  });
});

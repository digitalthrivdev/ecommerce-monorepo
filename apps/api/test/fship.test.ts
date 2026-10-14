import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "../src/generated/prisma/client";
import {
  createFshipProvider,
  FSHIP_SIGNATURE_HEADER,
  mapFshipStatus,
} from "../src/modules/shipping/fship-carrier.js";
import type { ShipmentInput } from "../src/modules/shipping/shipping-provider.js";

/**
 * Samples recorded from Fship's API document (v1.2.3.2), so the provider is exercised without a
 * real API call. Fship authenticates with a static header, so nothing is cached.
 */
const CREDENTIALS = {
  clientKey: "085c36066064af83c66b9dbf44d190d40feec79f437bc1c1cb",
  pickupAddressId: "9",
};

// Recorded samples (placeholders from the document spelled out, fields trimmed to what we read).
const SERVICEABILITY = {
  source: "201301",
  destination: "400020",
  pickup: "Available",
  reverse: "Available",
  prepaid: "Available",
  cod: "Available",
  status: true,
  response: "Serviceable",
};
const SERVICEABILITY_NO_COD = { ...SERVICEABILITY, prepaid: "Available", cod: "No" };
const SERVICEABILITY_UNSERVED = { ...SERVICEABILITY, pickup: "Not Available", reverse: "Not Available", prepaid: "Not Available", cod: "No" };
const SERVICEABILITY_REFUSED = { ...SERVICEABILITY, status: false, response: "Destination pincode not serviceable" };
const COURIERS = [{ courierId: 1, courierName: "Bluedart", logoUrl: "https://fship.in/logos/bluedart.png" }];
const CREATE_ORDER = { route_code: "SUR-DEL-01", order_status: "Booked", apiorderid: 123, waybill: "143455210101006", status: true, response: "Order created" };
const REGISTER_PICKUP = { apipickuporderids: [{ pickupOrderId: 693347, waybills: ["143455210101006"] }], status: true, response: "Pickup registered" };
const SUMMARY = {
  status: true,
  error: false,
  response: "Shipment summary available",
  summary: {
    waybill: "143455210101006",
    orderid: "1",
    fulfilledby: "XPressBees",
    orderedon: "2021-05-19 15:37:52",
    lastscanned: "2021-09-08 20:19:22",
    statuscode: "226",
    status: "Delivered",
    location: "DEL/GNA, NOIDA, UTTAR PRADESH",
    remark: "Shipment Delivered by SR: Rahul Kumar",
  },
};
const LABEL = {
  remark: "Manifest generated.",
  pickupOrderId: 693347,
  manifestfile: "https://fship.in/files/manifest-693347.pdf",
  invoicefile: "https://fship.in/files/invoice-693347.pdf",
  labelfile: "https://fship.in/files/label-693347.pdf",
};
const TRACKING = {
  status: true,
  error: false,
  response: "Scan data available.",
  summary: SUMMARY.summary,
  trackingdata: [
    {
      DateandTime: "2021-09-01 20:19:22",
      Status: "In Transit",
      Remark: "Shipment InScan from Manifest",
      Location: "Muradnagar, MODINAGAR, UTTAR PRADESH",
      shipmentJourney: 0,
    },
    {
      DateandTime: "2021-09-08 20:19:22",
      Status: "Dispatched",
      Remark: "Out for delivery",
      Location: "DEL/GNA, NOIDA, UTTAR PRADESH",
      shipmentJourney: 0,
    },
  ],
};
const TRACKING_NO_SCANS = { status: false, error: false, response: "No scans available.", trackingdata: [] };
const CANCEL = { status: true, response: "Order cancelled" };

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
  return createFshipProvider(CREDENTIALS);
}

function bodyOf(path: string) {
  const request = callLog.find((call) => call.url.includes(path));
  expect(request, `no call to ${path}`).toBeDefined();
  return JSON.parse(String(request!.init?.body));
}

beforeEach(() => {
  callLog.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("mapFshipStatus", () => {
  it("maps Fship labels to our shipment statuses", () => {
    expect(mapFshipStatus("Booked")).toBe("AWB_ASSIGNED");
    expect(mapFshipStatus("Pickup Scheduled")).toBe("PICKUP_SCHEDULED");
    expect(mapFshipStatus("Pickup Pending")).toBe("PICKUP_SCHEDULED");
    expect(mapFshipStatus("Manifest Generated")).toBe("PICKUP_SCHEDULED");
    expect(mapFshipStatus("Out for Pickup")).toBe("PICKUP_SCHEDULED");
    expect(mapFshipStatus("Picked Up")).toBe("PICKED_UP");
    expect(mapFshipStatus("In Transit")).toBe("IN_TRANSIT");
    expect(mapFshipStatus("Dispatched")).toBe("IN_TRANSIT");
    expect(mapFshipStatus("Shipped")).toBe("IN_TRANSIT");
    expect(mapFshipStatus("Out for delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapFshipStatus("Undelivered")).toBe("NDR");
    expect(mapFshipStatus("NDR")).toBe("NDR");
    expect(mapFshipStatus("Exception Raised")).toBe("NDR");
    expect(mapFshipStatus("Delivered")).toBe("DELIVERED");
    expect(mapFshipStatus("RTO Initiated")).toBe("RTO_IN_TRANSIT");
    expect(mapFshipStatus("RTO Delivered")).toBe("RTO_DELIVERED");
    expect(mapFshipStatus("Cancelled")).toBe("CANCELLED");
    expect(mapFshipStatus("Lost")).toBe("LOST");
    expect(mapFshipStatus("New")).toBe("PENDING");
    expect(mapFshipStatus("Pending")).toBe("PENDING");

    expect(mapFshipStatus("Delayed")).toBeNull();
    expect(mapFshipStatus("Pickup Exception")).toBeNull();
    expect(mapFshipStatus("")).toBeNull();
    expect(mapFshipStatus(null)).toBeNull();
  });
});

describe("checkServiceability", () => {
  it("answers from Fship's pincode lookup", async () => {
    stubFetch((url) => (url.includes("pincodeserviceability") ? json(SERVICEABILITY) : undefined));

    const result = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: true });
    // Fship returns no delivery estimate.
    expect(result).toEqual({ serviceable: true, codAvailable: true, etaDays: null });

    expect(bodyOf("pincodeserviceability")).toEqual({ source_Pincode: "201301", destination_Pincode: "400020" });
    expect((callLog[0].init?.headers as Record<string, string>)[FSHIP_SIGNATURE_HEADER]).toBe(CREDENTIALS.clientKey);
  });

  it("reports no COD when Fship says the pincode has none", async () => {
    stubFetch((url) => (url.includes("pincodeserviceability") ? json(SERVICEABILITY_NO_COD) : undefined));
    const noCod = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: true });
    expect(noCod).toEqual({ serviceable: true, codAvailable: false, etaDays: null });
  });

  it("reports an unserved or refused pincode as not serviceable", async () => {
    stubFetch((url) => (url.includes("pincodeserviceability") ? json(SERVICEABILITY_UNSERVED) : undefined));
    const unserved = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "999999", weightGrams: 600, cod: false });
    expect(unserved.serviceable).toBe(false);

    stubFetch((url) => (url.includes("pincodeserviceability") ? json(SERVICEABILITY_REFUSED) : undefined));
    const refused = await provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "999999", weightGrams: 600, cod: false });
    expect(refused.serviceable).toBe(false);
  });

  it("fails clearly when Fship refuses the request", async () => {
    stubFetch((url) => (url.includes("pincodeserviceability") ? json({ status: false, response: "Bad signature" }, 401) : undefined));
    await expect(provider().checkServiceability({ pickupPincode: "201301", deliveryPincode: "400020", weightGrams: 600, cod: false })).rejects.toMatchObject({
      code: "SHIPPING_CARRIER_ERROR",
    });
  });
});

describe("booking a shipment", () => {
  it("books the forward order, registers the pickup and keeps the ids", async () => {
    stubFetch((url) => {
      if (url.includes("createforwardorder")) return json(CREATE_ORDER);
      if (url.includes("registerpickup")) return json(REGISTER_PICKUP);
      if (url.includes("ShipmentSummary")) return json(SUMMARY);
      return undefined;
    });

    const booked = await provider().createShipment(SHIPMENT_INPUT);
    expect(booked).toEqual({
      providerOrderId: "123",
      providerShipmentId: "693347",
      awb: "143455210101006",
      courierName: "XPressBees",
      trackingUrl: null,
      status: "AWB_ASSIGNED",
    });

    expect(bodyOf("createforwardorder")).toMatchObject({
      customer_Name: "Asha Rao",
      customer_Mobile: "9812345678",
      customer_Emailid: "",
      customer_Address: "12 Marine Drive",
      landMark: "Near Churchgate",
      customer_Address_Type: "Home",
      customer_PinCode: "400020",
      customer_City: "Mumbai",
      orderId: "ORD-2026-0001",
      payment_Mode: 2,
      express_Type: "surface",
      is_Ndd: 0,
      order_Amount: 998,
      tax_Amount: 0,
      extra_Charges: 0,
      total_Amount: 998,
      cod_Amount: 0,
      shipment_Weight: 0.6,
      shipment_Length: 25,
      shipment_Width: 18,
      shipment_Height: 8,
      volumetric_Weight: 0.72,
      pick_Address_ID: 9,
      return_Address_ID: 0,
      courierId: 0,
      products: [{ productName: "Cotton Shirt (M)", unitPrice: 499, quantity: 2, sku: "SHIRT-M", hsnCode: "6109", taxRate: 0, productDiscount: 0 }],
    });
    expect(bodyOf("registerpickup")).toEqual({ waybills: ["143455210101006"] });
    expect(bodyOf("ShipmentSummary")).toEqual({ waybill: "143455210101006" });

    for (const call of callLog) {
      expect((call.init?.headers as Record<string, string>)[FSHIP_SIGNATURE_HEADER]).toBe(CREDENTIALS.clientKey);
    }
  });

  it("collects cash on a COD order", async () => {
    stubFetch((url) => {
      if (url.includes("createforwardorder")) return json(CREATE_ORDER);
      if (url.includes("registerpickup")) return json(REGISTER_PICKUP);
      return undefined;
    });

    await provider().createShipment({ ...SHIPMENT_INPUT, codAmount: new Prisma.Decimal("998.00") });
    expect(bodyOf("createforwardorder")).toMatchObject({ payment_Mode: 1, cod_Amount: 998, total_Amount: 998 });

    const booked = await provider().createShipment(SHIPMENT_INPUT);
    // The courier name is best effort: it is left out when Fship has no summary yet.
    expect(booked.courierName).toBeNull();
    expect(booked.awb).toBe("143455210101006");
  });

  it("cancels the Fship order when the pickup cannot be registered", async () => {
    stubFetch((url) => {
      if (url.includes("createforwardorder")) return json(CREATE_ORDER);
      if (url.includes("registerpickup")) return json({ status: false, response: "Pickup pincode not serviceable" });
      if (url.includes("cancelorder")) return json(CANCEL);
      return undefined;
    });

    await expect(provider().createShipment(SHIPMENT_INPUT)).rejects.toMatchObject({ code: "SHIPPING_CARRIER_ERROR" });
    expect(bodyOf("cancelorder")).toEqual({ reason: "Cancelled by the store", waybill: "143455210101006" });
  });

  it("fails clearly when Fship assigns no waybill", async () => {
    stubFetch((url) => (url.includes("createforwardorder") ? json({ ...CREATE_ORDER, waybill: null, status: false, response: "No route" }) : undefined));
    await expect(provider().createShipment(SHIPMENT_INPUT)).rejects.toMatchObject({ code: "SHIPPING_CARRIER_ERROR" });
  });

  it("books against the staging API when one is configured", async () => {
    stubFetch((url) => {
      if (url.includes("createforwardorder")) return json(CREATE_ORDER);
      if (url.includes("registerpickup")) return json(REGISTER_PICKUP);
      return undefined;
    });
    await createFshipProvider({ ...CREDENTIALS, baseUrl: "https://capi-qc.fship.in/" }).createShipment(SHIPMENT_INPUT);
    expect(callLog[0].url.startsWith("https://capi-qc.fship.in/api/createforwardorder")).toBe(true);
  });

  it("has nothing left to schedule, and no separate AWB step", async () => {
    const carrier = provider();
    expect(await carrier.schedulePickup({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" })).toEqual({ status: "PICKUP_SCHEDULED" });
    expect(await carrier.assignAwb({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" })).toEqual({
      awb: "143455210101006",
      courierName: null,
      trackingUrl: null,
    });
    await expect(carrier.assignAwb({ providerOrderId: "123", providerShipmentId: null, awb: null })).rejects.toMatchObject({ code: "SHIPPING_AWB_FAILED" });
  });
});

describe("labels, tracking and cancellation", () => {
  it("fetches the label with the pickup order id", async () => {
    stubFetch((url) => (url.includes("shippinglabelbypickupid") ? json(LABEL) : undefined));
    const carrier = provider();

    expect(await carrier.getLabel({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" })).toEqual({
      labelUrl: "https://fship.in/files/label-693347.pdf",
    });
    expect(bodyOf("shippinglabelbypickupid")).toEqual({ pickupOrderId: [693347] });

    await expect(carrier.getLabel({ providerOrderId: "123", providerShipmentId: null, awb: "143455210101006" })).rejects.toMatchObject({
      code: "SHIPPING_LABEL_UNAVAILABLE",
    });
    stubFetch((url) => (url.includes("shippinglabelbypickupid") ? json({ ...LABEL, labelfile: null }) : undefined));
    await expect(carrier.getLabel({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" })).rejects.toMatchObject({
      code: "SHIPPING_LABEL_UNAVAILABLE",
    });
  });

  it("maps the recorded scans and reads their IST times", async () => {
    stubFetch((url) => (url.includes("trackinghistory") ? json(TRACKING) : undefined));
    const events = await provider().track({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" });

    expect(events.map((event) => event.status)).toEqual(["IN_TRANSIT", "IN_TRANSIT"]);
    expect(events[0]).toMatchObject({
      providerEventId: "143455210101006:2021-09-01 20:19:22:In Transit",
      location: "Muradnagar, MODINAGAR, UTTAR PRADESH",
      description: "In Transit · Shipment InScan from Manifest",
    });
    expect(events[0].occurredAt.toISOString()).toBe("2021-09-01T14:49:22.000Z");
    expect(events[1].occurredAt.toISOString()).toBe("2021-09-08T14:49:22.000Z");
    expect(bodyOf("trackinghistory")).toEqual({ waybill: "143455210101006" });
  });

  it("records nothing when there are no scans, or none it can map", async () => {
    stubFetch((url) => (url.includes("trackinghistory") ? json(TRACKING_NO_SCANS) : undefined));
    expect(await provider().track({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" })).toEqual([]);

    stubFetch((url) =>
      url.includes("trackinghistory")
        ? json({ ...TRACKING, trackingdata: [{ DateandTime: "2021-09-09 10:00:00", Status: "Delayed", Remark: "Weather hold", Location: "Pune" }] })
        : undefined,
    );
    expect(await provider().track({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" })).toEqual([]);

    expect(await provider().track({ providerOrderId: "123", providerShipmentId: null, awb: null })).toEqual([]);
  });

  it("cancels by waybill, and refuses a shipment without one", async () => {
    stubFetch((url) => (url.includes("cancelorder") ? json(CANCEL) : undefined));
    const carrier = provider();

    await expect(carrier.cancelShipment({ providerOrderId: "123", providerShipmentId: "693347", awb: "143455210101006" })).resolves.toBeUndefined();
    expect(bodyOf("cancelorder")).toEqual({ reason: "Cancelled by the store", waybill: "143455210101006" });

    await expect(carrier.cancelShipment({ providerOrderId: "123", providerShipmentId: "693347", awb: null })).rejects.toMatchObject({
      code: "SHIPMENT_NOT_CANCELLABLE",
    });
  });
});

describe("credentials and webhooks", () => {
  it("reports whether the Client Key works", async () => {
    stubFetch((url) => (url.includes("getallcourier") ? json(COURIERS) : undefined));
    expect(await provider().checkCredentials()).toBe(true);

    stubFetch((url) => (url.includes("getallcourier") ? json({ message: "Unauthorized" }, 401) : undefined));
    expect(await provider().checkCredentials()).toBe(false);

    stubFetch((url) => (url.includes("getallcourier") ? json({ status: false, response: "Invalid signature" }) : undefined));
    expect(await provider().checkCredentials()).toBe(false);
  });

  it("has no webhooks to verify", () => {
    expect(provider().parseWebhook(JSON.stringify({ waybill: "143455210101006", status: "Delivered" }), {})).toBeNull();
    expect(provider().parseWebhook("not json", {})).toBeNull();
  });
});

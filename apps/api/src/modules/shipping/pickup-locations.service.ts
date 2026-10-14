import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { invoiceGstin } from "../../shared/gst.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import type { CreatePickupLocationInput, UpdatePickupLocationInput } from "./pickup-locations.schemas.js";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

const MAX_PICKUP_LOCATIONS = 20;

/** Where parcels ship from by default, and the seller's address on invoices. Null until one is added. */
export function defaultPickupLocation(db: Db) {
  return db.pickupLocation.findFirst({ where: { isDefault: true } });
}

/** Serialises changes, so two requests can't both leave a default (or none). */
async function lockLocations(tx: Tx) {
  await tx.$executeRaw`LOCK TABLE "PickupLocation" IN SHARE ROW EXCLUSIVE MODE`;
}

function nameTaken(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const nameTakenError = () =>
  new AppError(409, "PICKUP_LOCATION_NAME_TAKEN", "Another pickup location has this name", { field: "name" });

export function createPickupLocationsService(prisma: PrismaClient) {
  /** Default first. `invoiceGstin` is the GSTIN invoices carry when the location is the default. */
  async function listLocations() {
    const [items, settings] = await Promise.all([
      prisma.pickupLocation.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }], take: MAX_PICKUP_LOCATIONS }),
      getPlatformSettings(prisma),
    ]);
    return { items: items.map((location) => ({ ...location, invoiceGstin: invoiceGstin(location.state, settings.gstin) })) };
  }

  async function findLocation(tx: Tx, id: string) {
    const location = await tx.pickupLocation.findUnique({ where: { id } });
    if (!location) {
      throw new AppError(404, "PICKUP_LOCATION_NOT_FOUND", "Pickup location not found");
    }
    return location;
  }

  /** The first location becomes the default. */
  async function createLocation({ isDefault, ...data }: CreatePickupLocationInput) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockLocations(tx);
        const count = await tx.pickupLocation.count();
        if (count >= MAX_PICKUP_LOCATIONS) {
          throw new AppError(409, "TOO_MANY_PICKUP_LOCATIONS", `You can have at most ${MAX_PICKUP_LOCATIONS} pickup locations`);
        }
        const makeDefault = count === 0 || isDefault === true;
        if (makeDefault) {
          await tx.pickupLocation.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.pickupLocation.create({ data: { ...data, isDefault: makeDefault } });
      });
    } catch (error) {
      if (nameTaken(error)) throw nameTakenError();
      throw error;
    }
  }

  async function updateLocation(id: string, { isDefault, ...data }: UpdatePickupLocationInput) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockLocations(tx);
        const existing = await findLocation(tx, id);
        if (isDefault === false && existing.isDefault) {
          throw new AppError(409, "DEFAULT_PICKUP_LOCATION_REQUIRED", "Make another pickup location the default instead");
        }
        if (isDefault === true && !existing.isDefault) {
          await tx.pickupLocation.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.pickupLocation.update({ where: { id }, data: { ...data, ...(isDefault !== undefined && { isDefault }) } });
      });
    } catch (error) {
      if (nameTaken(error)) throw nameTakenError();
      throw error;
    }
  }

  /** The default can only be deleted when it is the last one. */
  async function deleteLocation(id: string) {
    await prisma.$transaction(async (tx) => {
      await lockLocations(tx);
      const existing = await findLocation(tx, id);
      if (existing.isDefault && (await tx.pickupLocation.count()) > 1) {
        throw new AppError(409, "DEFAULT_PICKUP_LOCATION_REQUIRED", "Make another pickup location the default before deleting this one");
      }
      await tx.pickupLocation.delete({ where: { id } });
    });
  }

  return { listLocations, createLocation, updateLocation, deleteLocation };
}

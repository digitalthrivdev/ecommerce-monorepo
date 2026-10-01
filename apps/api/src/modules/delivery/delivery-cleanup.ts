import { DeliveryPartnerStatus, DeliveryStatus, type Prisma } from "../../generated/prisma/client";

/** Cancels the order's open delivery and frees its partner. Runs inside the cancelling transaction. */
export async function cancelOpenDelivery(tx: Prisma.TransactionClient, orderId: string) {
  const delivery = await tx.delivery.findUnique({
    where: { orderId },
    select: { id: true, status: true, partnerId: true },
  });

  if (!delivery || delivery.status === DeliveryStatus.DELIVERED || delivery.status === DeliveryStatus.CANCELLED) {
    return;
  }

  await tx.delivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.CANCELLED } });

  if (delivery.partnerId) {
    await tx.deliveryPartner.updateMany({
      where: { id: delivery.partnerId, status: DeliveryPartnerStatus.BUSY },
      data: { status: DeliveryPartnerStatus.ONLINE },
    });
  }
}

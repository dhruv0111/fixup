import { getDb } from "@/server/db/client";
import { recordAudit } from "@/server/audit/service";
import { AppError } from "@/server/http/errors";
import type { Actor } from "@/server/permissions/service";
import { addressSchema, profileSchema } from "./schemas";

function customerId(actor: Actor) {
  if (!actor.customer)
    throw new AppError(
      409,
      "PROFILE_UNAVAILABLE",
      "Your account profile is unavailable. Please contact support.",
    );
  return actor.customer.id;
}

export async function readProfile(actor: Actor) {
  return getDb().customer.findUniqueOrThrow({
    where: { id: customerId(actor), userId: actor.id },
    select: {
      id: true,
      businessName: true,
      phone: true,
      createdAt: true,
      addresses: true,
      dealer: { select: { status: true } },
    },
  });
}

export async function updateProfile(actor: Actor, input: unknown) {
  const data = profileSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id: customerId(actor), userId: actor.id },
      data,
      select: { id: true, businessName: true, phone: true },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "PROFILE_UPDATED",
        entityType: "Customer",
        entityId: customer.id,
      },
      tx,
    );
    return customer;
  });
}

export async function createAddress(actor: Actor, input: unknown) {
  const data = addressSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const address = await tx.address.create({
      data: { ...data, customerId: customerId(actor) },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "ADDRESS_CREATED",
        entityType: "Address",
        entityId: address.id,
      },
      tx,
    );
    return address;
  });
}

export async function readAddress(actor: Actor, id: string) {
  const address = await getDb().address.findFirst({
    where: { id, customerId: customerId(actor) },
  });
  if (!address) throw new AppError(404, "NOT_FOUND", "Address not found.");
  return address;
}

export async function updateAddress(actor: Actor, id: string, input: unknown) {
  const data = addressSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const changed = await tx.address.updateMany({
      where: { id, customerId: customerId(actor) },
      data,
    });
    if (changed.count !== 1)
      throw new AppError(404, "NOT_FOUND", "Address not found.");
    await recordAudit(
      {
        actorId: actor.id,
        action: "ADDRESS_UPDATED",
        entityType: "Address",
        entityId: id,
      },
      tx,
    );
    return tx.address.findUniqueOrThrow({ where: { id } });
  });
}

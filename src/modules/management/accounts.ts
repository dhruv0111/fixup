import "server-only";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import type { Actor } from "@/server/permissions/service";
import {
  dealerApplication,
  dealerReview,
  customerStatus,
  listQuery,
} from "./schemas";
import { allowed, conflict, history } from "./history";
import type { Prisma } from "@/generated/prisma/client";

const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  managementVersion: true,
  createdAt: true,
} as const;
export async function ownDealer(actor: Actor) {
  if (!actor.customer)
    throw new AppError(409, "PROFILE_UNAVAILABLE", "Profile unavailable.");
  const dealer = await getDb().dealerProfile.findUnique({
    where: { customerId: actor.customer.id },
  });
  if (!dealer) return null;
  // Admin actors and internal review notes are deliberately excluded.
  return {
    id: dealer.id,
    status: dealer.status,
    businessName: dealer.businessName,
    contactName: dealer.contactName,
    phone: dealer.phone,
    email: dealer.email,
    address: dealer.address,
    city: dealer.city,
    state: dealer.state,
    postalCode: dealer.postalCode,
    businessType: dealer.businessType,
    gstin: dealer.gstin,
    expectedVolume: dealer.expectedVolume,
    message: dealer.message,
    reviewReason: dealer.reviewReason,
    createdAt: dealer.createdAt,
    updatedAt: dealer.updatedAt,
  };
}
export async function applyDealer(actor: Actor, input: unknown) {
  allowed(actor, "account.update");
  if (!actor.customer || !["CUSTOMER", "DEALER"].includes(actor.role))
    throw new AppError(403, "FORBIDDEN", "Only customer accounts can apply.");
  const data = dealerApplication.parse(input);
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dealer:${actor.customer!.id}`}, 0))::text`;
    const current = await tx.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { active: true },
    });
    if (!current.active)
      throw new AppError(403, "FORBIDDEN", "Your account is suspended.");
    const before = await tx.dealerProfile.findUnique({
      where: { customerId: actor.customer!.id },
    });
    if (before && before.status !== "REJECTED") {
      if (
        before.status === "PENDING" &&
        Object.entries(data).every(
          ([k, v]) => before[k as keyof typeof before] === v,
        )
      )
        return { id: before.id, status: before.status, duplicate: true };
      throw new AppError(
        409,
        "APPLICATION_EXISTS",
        "You already have an application. Contact FIXUP for changes.",
      );
    }
    const dealer = before
      ? await tx.dealerProfile.update({
          where: { id: before.id },
          data: {
            ...data,
            status: "PENDING",
            reviewedAt: null,
            reviewedById: null,
            reviewReason: null,
            version: { increment: 1 },
          },
        })
      : await tx.dealerProfile.create({
          data: { ...data, customerId: actor.customer!.id },
        });
    await tx.customer.update({
      where: { id: actor.customer!.id },
      data: { category: "RETAIL" },
    });
    await history(
      tx,
      actor,
      "DealerProfile",
      dealer.id,
      "DEALER_APPLIED",
      "Customer submitted dealer application",
      before,
      dealer,
    );
    return { id: dealer.id, status: dealer.status, duplicate: false };
  });
}
export async function reviewDealer(actor: Actor, id: string, input: unknown) {
  allowed(actor, "dealers.manage");
  const data = dealerReview.parse(input);
  return getDb().$transaction(async (tx) => {
    const before = await tx.dealerProfile.findUnique({
      where: { id },
      include: { customer: { select: { userId: true } } },
    });
    if (!before) throw new AppError(404, "NOT_FOUND", "Dealer not found.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dealer:${before.customerId}`}, 0))::text`;
    const transitions: Record<string, string[]> = {
      PENDING: ["APPROVED", "REJECTED"],
      APPROVED: ["SUSPENDED"],
      REJECTED: [],
      SUSPENDED: ["APPROVED"],
    };
    if (
      before.version !== data.version ||
      !transitions[before.status].includes(data.status)
    )
      throw conflict();
    const user = await tx.user.findUniqueOrThrow({
      where: { id: before.customer.userId },
    });
    if (!["CUSTOMER", "DEALER"].includes(user.role))
      throw new AppError(
        409,
        "STAFF_ACCOUNT",
        "Staff accounts cannot be converted to dealers.",
      );
    if (!user.active && data.status === "APPROVED")
      throw new AppError(
        409,
        "ACCOUNT_SUSPENDED",
        "Reactivate the customer account first.",
      );
    const changed = await tx.dealerProfile.updateMany({
      where: { id, version: data.version },
      data: {
        status: data.status,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewReason: data.reason,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw conflict();
    await tx.customer.update({
      where: { id: before.customerId },
      data: {
        category: data.status === "APPROVED" ? "APPROVED_DEALER" : "RETAIL",
      },
    });
    if (data.status === "APPROVED")
      await tx.user.update({
        where: { id: user.id },
        data: { role: "DEALER" },
      });
    const after = await tx.dealerProfile.findUniqueOrThrow({ where: { id } });
    await history(
      tx,
      actor,
      "DealerProfile",
      id,
      "DEALER_STATUS_CHANGED",
      data.reason,
      { status: before.status, version: before.version },
      { status: after.status, version: after.version },
    );
    return after;
  });
}
export async function setCustomerStatus(
  actor: Actor,
  id: string,
  input: unknown,
) {
  allowed(actor, "customers.manage");
  const data = customerStatus.parse(input);
  return getDb().$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id },
      include: { user: { select: publicUser } },
    });
    if (!customer || !["CUSTOMER", "DEALER"].includes(customer.user.role))
      throw new AppError(404, "NOT_FOUND", "Customer not found.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dealer:${id}`}, 0))::text`;
    const changed = await tx.user.updateMany({
      where: {
        id: customer.userId,
        managementVersion: data.version,
        role: { in: ["CUSTOMER", "DEALER"] },
      },
      data: { active: data.active, managementVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw conflict();
    await history(
      tx,
      actor,
      "User",
      customer.userId,
      "ACCOUNT_STATUS_CHANGED",
      data.reason,
      {
        active: customer.user.active,
        version: customer.user.managementVersion,
      },
      { active: data.active, version: data.version + 1 },
    );
    return { id, active: data.active, version: data.version + 1 };
  });
}
export async function listAccounts(
  actor: Actor,
  kind: "customers" | "dealers",
  input: unknown,
) {
  allowed(actor, kind === "customers" ? "customers.manage" : "dealers.manage");
  const { q, status, page } = listQuery.parse(input);
  const base: Prisma.CustomerWhereInput = {
    user: { role: { in: ["CUSTOMER", "DEALER"] } },
  };
  const search: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { businessName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          {
            user: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        ],
      }
    : {};
  if (kind === "customers") {
    if (status && !["ACTIVE", "INACTIVE"].includes(status))
      throw new AppError(422, "INVALID_STATUS", "Choose a customer status.");
    const where: Prisma.CustomerWhereInput = {
      AND: [
        base,
        search,
        ...(status ? [{ user: { active: status === "ACTIVE" } }] : []),
      ],
    };
    const [items, total] = await Promise.all([
      getDb().customer.findMany({
        where,
        select: {
          id: true,
          businessName: true,
          phone: true,
          category: true,
          user: { select: publicUser },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 25,
        skip: (page - 1) * 25,
      }),
      getDb().customer.count({ where }),
    ]);
    return { items, total, page, pages: Math.ceil(total / 25) };
  }
  if (status === "ACTIVE" || status === "INACTIVE")
    throw new AppError(422, "INVALID_STATUS", "Choose a dealer status.");
  const where: Prisma.DealerProfileWhereInput = {
    customer: base,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" } },
            { contactName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    getDb().dealerProfile.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    getDb().dealerProfile.count({ where }),
  ]);
  return { items, total, page, pages: Math.ceil(total / 25) };
}
export async function accountDetail(
  actor: Actor,
  kind: "customers" | "dealers",
  id: string,
) {
  allowed(actor, kind === "customers" ? "customers.manage" : "dealers.manage");
  const customer = await getDb().customer.findFirst({
    where: {
      ...(kind === "customers" ? { id } : { dealer: { id } }),
      user: { role: { in: ["CUSTOMER", "DEALER"] } },
    },
    include: { user: { select: publicUser }, addresses: true, dealer: true },
  });
  if (!customer) throw new AppError(404, "NOT_FOUND", "Record not found.");
  const entities = [
    customer.id,
    customer.userId,
    ...customer.addresses.map((a) => a.id),
    ...(customer.dealer ? [customer.dealer.id] : []),
  ];
  const [events, audit] = await Promise.all([
    getDb().managementEvent.findMany({
      where: { entityId: { in: entities } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getDb().auditLog.findMany({
      where: { entityId: { in: entities } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return { customer, events, audit };
}

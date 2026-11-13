import { z } from "zod";
import { getDb } from "@/server/db/client";
import { requirePermission } from "@/server/permissions/service";
import { json, withApi } from "@/server/http/errors";
export const GET = withApi(async (request) => {
  await requirePermission(request.headers, "enquiries.read");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(new URL(request.url).searchParams.get("page") ?? 1);
  const enquiries = await getDb().enquiry.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * 25,
    take: 25,
    select: {
      id: true,
      kind: true,
      name: true,
      businessName: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      postalCode: true,
      businessType: true,
      gstin: true,
      quantity: true,
      location: true,
      message: true,
      createdAt: true,
      product: { select: { name: true, sku: true } },
    },
  });
  return json({ enquiries, page });
});

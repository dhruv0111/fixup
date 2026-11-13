import "server-only";
import { getDb } from "@/server/db/client";
import { recordAudit } from "@/server/audit/service";
import { AppError } from "@/server/http/errors";
import { publicProductWhere } from "@/modules/catalogue/service";
import { enquirySchema } from "./validation";
import { digest, verifyChallenge } from "./protection";

export async function submitEnquiry(input: unknown) {
  const parsed = enquirySchema.parse(input);
  verifyChallenge(parsed.token, parsed.website);
  const { requestId, token, website, consent, ...data } = parsed;
  void token;
  void website;
  void consent;
  const payloadDigest = digest(JSON.stringify(data));
  await getDb().$transaction(async (tx) => {
    // Serialize both same-ID retries and equivalent payloads across all instances.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 0))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${payloadDigest}, 1))::text`;
    const previous = await tx.enquiry.findUnique({
      where: { requestId },
      select: { payloadDigest: true },
    });
    if (previous) {
      if (previous.payloadDigest !== payloadDigest)
        throw new AppError(
          409,
          "REQUEST_CONFLICT",
          "This request was already used. Refresh the form to send a new enquiry.",
        );
      return;
    }
    const recent = await tx.enquiry.findFirst({
      where: {
        payloadDigest,
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) return;
    if (
      data.productId &&
      !(await tx.product.findFirst({
        where: { ...publicProductWhere(), id: data.productId },
        select: { id: true },
      }))
    )
      throw new AppError(
        422,
        "INVALID_PRODUCT",
        "Choose a currently published product.",
      );
    const enquiry = await tx.enquiry.create({
      data: { ...data, requestId, payloadDigest },
    });
    await recordAudit(
      {
        actorId: null,
        action: "ENQUIRY_RECEIVED",
        entityType: "Enquiry",
        entityId: enquiry.id,
      },
      tx,
    );
  });
  // Never echo personal information, internal IDs, or distinguish duplicate people.
  return { received: true };
}

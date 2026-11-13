import { json, withApi } from "@/server/http/errors";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { limitEnquiries } from "@/modules/enquiries/protection";
import { submitEnquiry } from "@/modules/enquiries/service";

export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  await limitEnquiries(request);
  return json(await submitEnquiry(await readJson(request)), 200);
});

import { json, withApi } from "@/server/http/errors";
import { challenge, limitEnquiries } from "@/modules/enquiries/protection";
export const GET = withApi(async (request) => {
  await limitEnquiries(request, "challenge", 60);
  return json({ token: challenge() });
});

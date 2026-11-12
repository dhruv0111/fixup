import { getEnv } from "@/config/env";
import { AppError } from "./errors";

export function assertSameOrigin(request: Request) {
  if (
    request.headers.get("origin") !== new URL(getEnv().BETTER_AUTH_URL).origin
  ) {
    throw new AppError(403, "INVALID_ORIGIN", "This request is not allowed.");
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new AppError(415, "INVALID_CONTENT_TYPE", "Use application/json.");
  }
}

export async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError(400, "INVALID_JSON", "A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

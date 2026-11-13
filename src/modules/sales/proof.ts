import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { getEnv } from "@/config/env";
import { AppError } from "@/server/http/errors";
const limit = 5 * 1024 * 1024;
export async function proofImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new AppError(
      415,
      "INVALID_FILE",
      "Upload a PNG, JPEG or WebP screenshot.",
    );
  if (file.size < 1 || file.size > limit)
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      "Screenshot must be between 1 byte and 5 MiB.",
    );
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const image = sharp(source, {
      limitInputPixels: 16000000,
      failOn: "warning",
      animated: true,
    });
    const metadata = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("Invalid format");
    const { data, info } = await image
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    if (data.length > limit) throw new Error("Output too large");
    return {
      imageBytes: new Uint8Array(data),
      imageHash: createHash("sha256").update(data).digest("hex"),
      imageSize: data.length,
      width: info.width,
      height: info.height,
      originalName: file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100),
    };
  } catch {
    throw new AppError(
      422,
      "INVALID_IMAGE",
      "Screenshot could not be safely decoded. Use a single PNG, JPEG or WebP image up to 16 megapixels and 5 MiB.",
    );
  }
}
export async function readProofForm(request: Request) {
  if (
    request.headers.get("origin") !== new URL(getEnv().BETTER_AUTH_URL).origin
  )
    throw new AppError(403, "INVALID_ORIGIN", "This request is not allowed.");
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;"))
    throw new AppError(415, "INVALID_CONTENT_TYPE", "Use multipart/form-data.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "INVALID_UPLOAD", "Upload required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit + 65536) {
      await reader.cancel();
      throw new AppError(413, "FILE_TOO_LARGE", "Upload exceeds 5 MiB.");
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": type },
    }).formData();
  } catch {
    throw new AppError(400, "INVALID_UPLOAD", "Invalid upload.");
  }
  const fields: Record<string, unknown> = {};
  for (const [key, value] of form) {
    if (
      Object.hasOwn(fields, key) ||
      ![
        "requestId",
        "method",
        "reference",
        "paidOn",
        "remarks",
        "file",
      ].includes(key)
    )
      throw new AppError(
        422,
        "INVALID_UPLOAD",
        "Unexpected or repeated upload field.",
      );
    fields[key] = value;
  }
  return fields;
}

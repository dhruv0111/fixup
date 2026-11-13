import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ProfileProvisioningError } from "@/modules/identity/provisioning";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function apiError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2025", "P2034"].includes(error.code))
    return NextResponse.json({ error: { code: "CONFLICT", message: "This record already exists, has changed, or references unavailable data. Refresh and check your entries." } }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (error instanceof ProfileProvisioningError)
    return NextResponse.json(
      { error: { code: "PROFILE_SETUP_PENDING", message: error.message } },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Check the submitted fields.",
          fields: error.flatten().fieldErrors,
        },
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  const requestId = randomUUID();
  // Do not log raw exceptions: database errors may include user data or credentials.
  console.error(
    JSON.stringify({
      event: "request_failed",
      requestId,
      type: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        requestId,
      },
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function withApi(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      return apiError(error);
    }
  };
}

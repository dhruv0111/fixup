import { randomBytes, randomUUID } from "node:crypto";
import { request, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.APP_ENV !== "test" ||
  !/^\/fixup_[a-z_]*test$/.test(database.pathname) ||
  !["localhost", "127.0.0.1"].includes(database.hostname)
) {
  throw new Error("Refusing to use a non-test database.");
}
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3 }),
});
export const origin = "http://127.0.0.1:3100";
export function dummyCredentials() {
  return {
    name: "Test Customer",
    email: `${randomUUID()}@fixup.test`,
    password: randomBytes(24).toString("base64url"),
  };
}
export function testIp() {
  return `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${1 + (randomBytes(1)[0] % 254)}`;
}
export async function context(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin, "x-test-client-ip": testIp() },
  });
}
export async function registered() {
  const api = await context();
  const credentials = dummyCredentials();
  const response = await api.post("/api/auth/sign-up/email", {
    data: credentials,
  });
  expect(response.status(), await response.text()).toBe(200);
  const user = await db.user.findUniqueOrThrow({
    where: { email: credentials.email },
    include: { customer: true },
  });
  return { api, credentials, user };
}

export const dummyAddress = {
  recipient: "Test Recipient",
  phone: "9000000000",
  line1: "123 Test Street",
  city: "Test City",
  state: "Test State",
  postalCode: "400001",
  country: "IN",
};

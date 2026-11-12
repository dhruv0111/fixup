import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nodemailer from "nodemailer";
import { getEnv } from "@/config/env";

export async function sendPasswordRecovery(to: string, url: string) {
  const env = getEnv();
  const message = {
    from: env.MAIL_FROM,
    to,
    subject: "Reset your FIXUP password",
    text: `Use this single-use link to reset your FIXUP password. It expires in 30 minutes.\n\n${url}\n\nIf you did not request this, ignore this message.`,
  };
  if (env.MAIL_MODE === "file") {
    if (env.APP_ENV === "production")
      throw new Error("Local mail is unavailable in production.");
    const directory = resolve(
      ".local",
      env.APP_ENV === "test" ? "test-mail" : "mail",
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Reset links are secrets. Local files are private, ignored, and never served or logged.
    await writeFile(
      resolve(directory, `${randomUUID()}.json`),
      JSON.stringify(message),
      { mode: 0o600, flag: "wx" },
    );
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    requireTLS: env.SMTP_SECURE !== "true",
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
  });
  await transport.sendMail(message);
}

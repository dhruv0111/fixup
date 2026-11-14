import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^postgres(ql)?:/.test(v)),
  DATABASE_SSL_CA_FILE: z.string().optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .refine((v) => !v.startsWith("REPLACE_")),
  BETTER_AUTH_URL: z.string().url(),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  MAIL_MODE: z.enum(["file", "smtp"]).default("file"),
  MAIL_FROM: z.string().min(3).default("FIXUP <noreply@example.invalid>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  TRUSTED_IP_HEADER: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;
export function getEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report names only, never connection strings or secrets.
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}. See .env.example.`,
    );
  }
  const env = parsed.data;
  if (
    env.APP_ENV !== "production" &&
    !["localhost", "127.0.0.1"].includes(new URL(env.BETTER_AUTH_URL).hostname)
  ) {
    throw new Error(
      "Development and test environments must use a loopback application URL.",
    );
  }
  if (env.APP_ENV === "production") {
    const dbUrl = new URL(env.DATABASE_URL);
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) &&
      dbUrl.searchParams.get("sslmode") !== "verify-full"
    )
      throw new Error(
        "Production remote database requires sslmode=verify-full.",
      );
    if (
      process.env.FIXUP_ALLOW_PRIVILEGED_OPERATIONS === "1" &&
      process.env.FIXUP_PROCESS_ROLE !== "operator"
    )
      throw new Error(
        "Privileged operations must run in the dedicated operator process.",
      );
    if (
      !env.BETTER_AUTH_URL.startsWith("https://") ||
      env.MAIL_MODE !== "smtp" ||
      !env.SMTP_HOST
    ) {
      throw new Error(
        "Production requires HTTPS and configured SMTP delivery.",
      );
    }
    // The local example sender cannot deliver recovery mail in production.
    // Validate one explicit mailbox; ownership/delivery still needs operator verification.
    const mailbox =
      env.MAIL_FROM.match(/^[^<>\r\n]*<([^<>\r\n]+)>$/)?.[1] ?? env.MAIL_FROM;
    if (
      !process.env.MAIL_FROM ||
      !z.email().safeParse(mailbox).success ||
      mailbox.toLowerCase().endsWith("@example.invalid")
    ) {
      throw new Error(
        "Production requires an explicit valid MAIL_FROM sender.",
      );
    }
  }
  if (env.MAIL_MODE === "smtp" && !env.SMTP_HOST)
    throw new Error("SMTP_HOST is required for SMTP delivery.");
  cached = env;
  return env;
}

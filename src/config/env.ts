import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^postgres(ql)?:/.test(v)),
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
    if (
      !env.BETTER_AUTH_URL.startsWith("https://") ||
      env.MAIL_MODE !== "smtp" ||
      !env.SMTP_HOST
    ) {
      throw new Error(
        "Production requires HTTPS and configured SMTP delivery.",
      );
    }
  }
  if (env.MAIL_MODE === "smtp" && !env.SMTP_HOST)
    throw new Error("SMTP_HOST is required for SMTP delivery.");
  cached = env;
  return env;
}

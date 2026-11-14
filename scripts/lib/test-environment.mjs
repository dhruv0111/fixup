import { existsSync, readFileSync } from "node:fs";
import dotenv from "dotenv";

function databaseUrl(value) {
  try {
    return new URL(value);
  } catch {
    throw new Error(
      "Invalid database URL; configuration values are suppressed.",
    );
  }
}

function databaseIdentity(value) {
  const url = databaseUrl(value);
  if (
    [...url.searchParams.keys()].some((key) =>
      [
        "host",
        "hostaddr",
        "port",
        "user",
        "password",
        "dbname",
        "database",
        "service",
        "options",
      ].includes(key),
    )
  )
    throw new Error(
      "Database identity comparison refuses connection target overrides.",
    );
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ? "loopback"
    : url.hostname;
  return `${host}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
}

export function loadTestEnvironment() {
  if (!existsSync(".env.test"))
    throw new Error(
      "Create a separate .env.test before running database tests.",
    );
  const config = dotenv.parse(readFileSync(".env.test"));
  const database = databaseUrl(config.DATABASE_URL);
  if (
    [...database.searchParams.keys()].some((key) =>
      [
        "host",
        "hostaddr",
        "port",
        "user",
        "password",
        "dbname",
        "database",
        "service",
        "options",
      ].includes(key),
    )
  )
    throw new Error("Test database connection target overrides are forbidden.");
  if (
    !/^\/fixup_[a-z_]*test$/.test(database.pathname) ||
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    config.APP_ENV !== "test"
  )
    throw new Error(
      "Refusing non-test data: use APP_ENV=test and a named loopback fixup_*test database.",
    );
  if (existsSync(".env")) {
    const development = dotenv.parse(readFileSync(".env"));
    if (
      development.DATABASE_URL &&
      databaseIdentity(development.DATABASE_URL) ===
        databaseIdentity(config.DATABASE_URL)
    )
      throw new Error(
        "Development and test databases must be different databases.",
      );
  }
  return config;
}

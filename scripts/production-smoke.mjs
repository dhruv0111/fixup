import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

if (!existsSync(".next/BUILD_ID"))
  throw new Error("Run npm run build before the production smoke check.");
const port = 3200;
// Refuse to mistake someone else's running application for this build.
const probe = createServer();
probe.listen(port, "127.0.0.1");
await once(probe, "listening");
await new Promise((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);

const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let exited = false;
child.on("exit", () => {
  exited = true;
});
// Drain diagnostic output without forwarding accidental credential-bearing exceptions.
child.stderr.resume();
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (exited) throw new Error("Production server exited before readiness.");
    try {
      ready = (
        await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })
      ).ok;
    } catch {
      /* still starting */
    }
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error("Production server did not become ready.");
  const checks = [
    ["/", 200],
    ["/login", 200],
    ["/two-factor", 200],
    ["/account/security", 200],
    ["/api/health/ready", 200],
    ["/api/v1/me", 401],
    ["/api/v1/admin/overview", 401],
    ["/api/v1/me/cart", 401],
    ["/api/v1/me/orders", 401],
    ["/api/v1/payments/unknown/proof", 401],
    ["/api/v1/admin/sales/orders", 401],
    ["/api/v1/admin/sales/settings", 401],
    ["/api/v1/admin/dispatch", 401],
    ["/api/v1/admin/dispatch/unknown", 401],
    ["/api/v1/me/orders/unknown/delivery", 401],
    ["/api/v1/delivery-proofs/unknown", 401],
    ["/api/v1/admin/reports/dashboard", 401],
    ["/api/v1/admin/reports/profitability?format=csv", 401],
    ["/api/v1/admin/reports/sales?format=csv", 401],
    ["/api/v1/admin/expenses/unknown", 401],
    ["/api/v1/expense-attachments/unknown", 401],
  ];
  for (const [path, expected] of checks) {
    if (path === "/account/security") {
      // App Router streaming redirects are completed by the browser.
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(`${base}${path}`);
        await page.waitForURL(`${base}/login`, { timeout: 10000 });
        console.log(
          "PASS /account/security (anonymous browser redirected to /login)",
        );
      } finally {
        await browser.close();
      }
      continue;
    }
    const response = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.status !== expected)
      throw new Error(
        `Production smoke failed: ${path} expected ${expected}, got ${response.status}.`,
      );
    console.log(`PASS ${path} (${expected})`);
  }
  console.log(
    `${checks.length} production smoke checks passed. No data was created or modified.`,
  );
} finally {
  if (!exited) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}

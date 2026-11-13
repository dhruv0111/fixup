import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, devices } from "playwright";

if (!existsSync(".next/BUILD_ID"))
  throw new Error("Build the application before capturing the public pages.");
const port = 3200;
const probe = createServer();
probe.listen(port, "127.0.0.1");
await once(probe, "listening");
await new Promise((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);
const server = spawn(
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
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);
let exited = false;
server.on("exit", () => {
  exited = true;
});
let browser;
const base = `http://127.0.0.1:${port}`;
const directory = ".local/qa/final";
mkdirSync(directory, { recursive: true });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (exited) throw new Error("Preview server exited before readiness.");
    try {
      ready = (
        await fetch(`${base}/api/health/ready`, {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {
      /* startup */
    }
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error("Preview server did not become ready.");
  browser = await chromium.launch();
  const paths = [
    "/",
    "/about",
    "/products",
    "/products/demo-adhesive-1",
    "/applications",
    "/become-a-dealer",
    "/bulk-orders",
    "/contact",
    "/faq",
    "/policies/privacy",
    "/policies/terms",
    "/policies/shipping",
    "/policies/returns",
  ];
  let count = 0;
  for (const [name, options] of [
    ["desktop", { viewport: { width: 1440, height: 1000 } }],
    ["mobile", devices["iPhone 13"]],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    for (const path of paths) {
      const response = await page.goto(`${base}${path}`, {
        waitUntil: "networkidle",
      });
      if (response?.status() !== 200)
        throw new Error(`Page capture failed for ${path}.`);
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`Horizontal overflow on ${path} at ${name}.`);
      await page.screenshot({
        path: `${directory}/${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}-${name}.png`,
        fullPage: true,
      });
      count++;
    }
    await context.close();
  }
  console.log(
    `${count} public screenshots captured in ${directory}; all returned 200 and fit their viewport.`,
  );
} finally {
  await browser?.close();
  if (!exited) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
}

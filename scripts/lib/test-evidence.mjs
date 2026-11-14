import { randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Keep immutable private snapshots before Playwright refreshes shared output paths.
export function evidenceArchive() {
  const root = join(".local", "test-evidence", `${Date.now()}-${randomUUID()}`);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return {
    root,
    preserve(stage) {
      if (!["before", "after"].includes(stage))
        throw new Error("Invalid evidence stage.");
      const target = join(root, stage);
      mkdirSync(target, { mode: 0o700 });
      for (const [source, name] of [
        [".local/qa", "qa"],
        ["test-results", "test-results"],
        ["playwright-report", "playwright-report"],
      ]) {
        if (existsSync(source))
          cpSync(source, join(target, name), {
            recursive: true,
            errorOnExist: true,
            force: false,
            filter: (path) => !lstatSync(path).isSymbolicLink(),
          });
      }
    },
  };
}

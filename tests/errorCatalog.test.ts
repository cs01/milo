// Gate on docs/errors.md — the compile-error reference, generated from tests/errors/.
//
// The suite pins 242 programs the compiler must reject, each with the message it must
// produce and often a comment explaining why the rule exists. That was a reference
// manual with no index: a user hitting "cannot move out of a borrow" had 242 files and
// nowhere to look it up.
import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { cases } from "../scripts/gen-error-catalog";

const ROOT = join(import.meta.dir, "..");

test("the checked-in catalog matches the generator", () => {
  // Regenerate with: bun run scripts/gen-error-catalog.ts
  execFileSync("bun", ["run", "scripts/gen-error-catalog.ts", "--check"], { cwd: ROOT, stdio: "pipe" });
});

test("every error fixture carries an @error: annotation the driver can read", () => {
  // cases() throws on a fixture without one. The count guard is the point: a scan that
  // found nothing would report perfect compliance.
  const all = cases();
  const onDisk = readdirSync(join(ROOT, "tests", "errors")).filter(f => f.endsWith(".milo")).length;
  expect(all.length).toBe(onDisk);
  expect(all.every(c => c.message.length > 0)).toBe(true);
});

test("the catalog documents every distinct message", () => {
  const doc = readFileSync(join(ROOT, "docs", "errors.md"), "utf-8");
  const messages = new Set(cases().map(c => c.message));
  expect(messages.size).toBeGreaterThan(100);
  expect([...messages].filter(m => !doc.includes(`## ${m}`))).toEqual([]);
});

// Drift guard: committed docs/std/*.md must match what the generator produces
// from the current std doc-comments. If this fails, run:
//   bun run scripts/gen-std-docs.ts
import { test, expect } from "bun:test";
import { stdDocsByModule } from "../src/api-search";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const OUT_DIR = join(import.meta.dir, "..", "docs", "std");

test("committed std docs are up to date with std doc-comments", () => {
  const docs = stdDocsByModule();
  const stale: string[] = [];
  for (const [stem, body] of docs) {
    const path = join(OUT_DIR, `${stem}.md`);
    const expected = `# std/${stem}\n\n${body}`;
    if (!existsSync(path) || readFileSync(path, "utf-8") !== expected) stale.push(stem);
  }
  if (stale.length) {
    throw new Error(`stale/missing docs for: ${stale.join(", ")}\nrun: bun run scripts/gen-std-docs.ts`);
  }
});

// Coverage ratchet. 893 of 1571 public std entries render as "_Undocumented._", and
// nothing measured that — so an API could ship with no doc-comment and the generated
// reference would grow another blank row silently. The number may only go DOWN: writing
// a doc-comment lowers it, adding an undocumented API raises it and fails here.
//
// Lower the baseline in the same commit that improves the docs. It is deliberately one
// number rather than a per-module table: a table is a second thing to maintain, and the
// only motion that matters is the total.
const UNDOCUMENTED_BASELINE = 886; // measured 2026-08-22

test("the undocumented-API count only goes down", () => {
  let undocumented = 0;
  let entries = 0;
  for (const [, body] of stdDocsByModule()) {
    undocumented += (body.match(/_Undocumented\._/g) ?? []).length;
    entries += (body.match(/^### /gm) ?? []).length;
  }
  // A generator that stopped emitting entries would report perfect coverage.
  expect(entries).toBeGreaterThan(1000);
  expect(`${undocumented} undocumented (baseline ${UNDOCUMENTED_BASELINE})`)
    .toBe(`${Math.min(undocumented, UNDOCUMENTED_BASELINE)} undocumented (baseline ${UNDOCUMENTED_BASELINE})`);
});

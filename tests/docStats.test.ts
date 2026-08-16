// Gate on the corpus counts quoted in prose (scripts/gen-stats.ts).
//
// CLAUDE.md claimed the nightly self-host sweep covered 589 fixtures and
// docs/testing.md claimed 470, against a real 597. A number inside a sentence is
// invisible to every other gate in the repo, so it drifts silently and then gets
// quoted back as fact.
import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { STATS } from "../scripts/gen-stats";

const ROOT = join(import.meta.dir, "..");

test("every marked count matches the repo", () => {
  // Regenerate with: bun run scripts/gen-stats.ts
  execFileSync("bun", ["run", "scripts/gen-stats.ts", "--check"], { cwd: ROOT, stdio: "pipe" });
});

test("the stat functions count something", () => {
  // A metric that silently returns 0 would let --check pass against an empty repo.
  for (const [name, fn] of Object.entries(STATS)) {
    expect(`${name}: ${fn()}`).not.toBe(`${name}: 0`);
  }
});

test("the fixture count is the number the test driver actually walks", () => {
  // Independent of gen-stats.ts: if both used the same helper, a bug in it would
  // agree with itself.
  const onDisk = readdirSync(join(ROOT, "tests", "fixtures")).filter(f => f.endsWith(".milo")).length;
  const claimed = /<!-- stat:fixtures -->(\d+)<!-- \/stat -->/.exec(readFileSync(join(ROOT, "CLAUDE.md"), "utf-8"))?.[1];
  expect(claimed).toBe(String(onDisk));
});

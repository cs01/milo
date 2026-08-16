// Gate on the benchmark numbers, which existed in three hand-synced copies:
// hyperfine's benchmarks/results-*.md, the table in benchmarks/README.md, and the
// `benchmarks` array behind <BenchmarkChart /> on the docs site. They had diverged —
// results-fib.md measured milo at 17.4 ms against a published 20.8 ms — and the copy a
// reader sees first is the one nothing regenerates.
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

test("the rendered table and chart match benchmarks/results.json", () => {
  // Regenerate with: bun run scripts/gen-benchmarks.ts
  execFileSync("bun", ["run", "scripts/gen-benchmarks.ts", "--check"], { cwd: ROOT, stdio: "pipe" });
});

test("every benchmark in the source appears in both targets", () => {
  const { benchmarks } = JSON.parse(readFileSync(join(ROOT, "benchmarks/results.json"), "utf-8"));
  const readme = readFileSync(join(ROOT, "benchmarks/README.md"), "utf-8");
  const chart = readFileSync(join(ROOT, "docs/site/.vitepress/theme/BenchmarkChart.vue"), "utf-8");
  expect(benchmarks.length).toBeGreaterThan(5); // the source must actually hold rows
  for (const b of benchmarks) {
    expect(`${b.name} in README: ${readme.includes(b.name)}`).toBe(`${b.name} in README: true`);
    expect(`${b.name} in chart: ${chart.includes(b.name)}`).toBe(`${b.name} in chart: true`);
  }
});

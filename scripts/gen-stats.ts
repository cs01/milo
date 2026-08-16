// Fills in the corpus counts quoted in prose, so a doc cannot claim a number the
// repo stopped matching.
//
// Run:  bun run scripts/gen-stats.ts          # rewrite every marked count
//       bun run scripts/gen-stats.ts --check  # fail if any is stale (CI/test)
//       bun run scripts/gen-stats.ts --list   # print the current values
//
// Mark a count in any tracked doc as `<!-- stat:NAME -->123<!-- /stat -->`; the text
// between the markers is replaced. Docs drifted quietly before this — CLAUDE.md said
// the nightly sweep covered 589 fixtures and docs/testing.md said 470, against a real
// 597 — because a count in a sentence is invisible to every other gate.
//
// Only LIVE claims get markers. A dated audit or decision record (stdlib-audit-*.md,
// selfhost-endgame-decision.md, security-audit-*.md) states what was true when it was
// written; rewriting those numbers would falsify the record, so they stay untouched.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

const countMilo = (dir: string) =>
  existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter(f => f.endsWith(".milo")).length : 0;

function countExamples(): number {
  let n = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".milo")) n++;
    }
  };
  walk(join(ROOT, "examples"));
  return n;
}

export const STATS: Record<string, () => number> = {
  fixtures: () => countMilo("tests/fixtures"),
  "error-fixtures": () => countMilo("tests/errors"),
  "runtime-error-fixtures": () => countMilo("tests/runtime-errors"),
  "prove-fixtures": () => countMilo("tests/prove"),
  // Platform arms (foo.darwin.milo, foo.linux.milo) are one importable module behind
  // one name, which is the number a user of `from "std/x"` experiences.
  "std-modules": () => new Set(
    readdirSync(join(ROOT, "std")).filter(f => f.endsWith(".milo")).map(f => f.split(".")[0]),
  ).size,
  "example-programs": () => countExamples(),
};

// Docs whose counts are current claims, not a dated record.
const TRACKED = ["CLAUDE.md", "AGENTS.md", "README.md", "docs/testing.md", "docs/roadmap.md"];

const MARKER = /<!-- stat:([a-z-]+) -->(.*?)<!-- \/stat -->/g;

function rewrite(text: string, file: string): string {
  return text.replace(MARKER, (_m, name: string, old: string) => {
    const fn = STATS[name];
    if (!fn) throw new Error(`${file}: unknown stat '${name}' — add it to STATS in scripts/gen-stats.ts`);
    return `<!-- stat:${name} -->${fn()}<!-- /stat -->`;
  });
}

// STATS is imported by tests/docStats.test.ts, so the CLI half must not run on import
// — it writes files, and a test that rewrites the docs it is checking proves nothing.
if (import.meta.main) {
  if (process.argv.includes("--list")) {
    for (const [name, fn] of Object.entries(STATS)) console.log(`${name}\t${fn()}`);
    process.exit(0);
  }

  const check = process.argv.includes("--check");
  let stale = 0;
  let marked = 0;
  for (const file of TRACKED) {
    const path = join(ROOT, file);
    const current = readFileSync(path, "utf-8");
    marked += [...current.matchAll(MARKER)].length;
    const next = rewrite(current, file);
    if (current === next) continue;
    if (check) { console.error(`${file}: a marked count is stale`); stale++; }
    else writeFileSync(path, next);
  }

  // A marker-less run would report success having checked nothing.
  if (marked === 0) { console.error("no stat markers found in any tracked doc — the markers or the file list are wrong"); process.exit(1); }

  if (check) {
    if (stale > 0) { console.error(`run: bun run scripts/gen-stats.ts`); process.exit(1); }
    console.log(`${marked} marked counts are up to date`);
  } else {
    console.log(`updated ${marked} marked counts across ${TRACKED.length} docs`);
  }
}

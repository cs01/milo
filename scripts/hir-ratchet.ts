#!/usr/bin/env bun
// How much of src-milo's backend still re-derives what the frontend already knew?
//
//   bun scripts/hir-ratchet.ts            # census
//   bun scripts/hir-ratchet.ts --check    # exit 1 if ANY counter grew
//   bun scripts/hir-ratchet.ts --write    # rebaseline downward (a raise needs --allow-raise)
//
// src-milo hands codegen the AST and nothing else: `genProgram(finalProg, sourceDir)`
// runs after the Checker object is dropped on the floor. So the backend re-derives
// every type it needs — as strings, through a partial function whose failure value is
// `""`, which callers read as "skip the ownership decision". Getting a typed HIR
// between the two is a long migration, and a long migration needs a number that only
// goes one way.
//
// These counters are that number. Each one is a symbol that exists ONLY because the
// backend has to reconstruct frontend knowledge:
//
//   astTypeStr / resolveAstTy / placeTypeStr   re-derive a type from syntax
//   hintTy                                     thread an expected type DOWN the tree,
//                                              because nodes cannot carry their own
//   Unlowered                                  the one sanctioned AST escape hatch in
//                                              HIR — see the four constraints below
//
// The Unlowered bridge is the mechanism that killed the previous HIR attempt (1210
// lines, never imported, deleted in 04738180). It is sanctioned here on terms: it
// carries no type field, every construction site is counted below, it must reach zero,
// and any codegen path that meets one where it wants a type aborts naming the node
// kind rather than defaulting. A defaulting bridge is how a migration ships silently
// wrong code instead of failing.
//
// Deliberately NOT a percentage with a tolerance, unlike selfhost-irsize.ts. There is
// no honest reason for one of these to drift upward mid-migration, so any increase is
// a failure and raising the baseline takes an explicit flag and a written reason.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const MILO_ROOT = join(import.meta.dir, "..");
const SRC_MILO = join(MILO_ROOT, "src-milo");
const BASELINE = join(MILO_ROOT, "tests", "hir-ratchet.json");

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const write = argv.includes("--write");
const allowRaise = argv.includes("--allow-raise");
const ri = argv.indexOf("--reason");
const reason = ri >= 0 ? argv[ri + 1] : "";

const COUNTERS = [
  ["astTypeStr", "re-derives a type string from an AST type"],
  ["resolveAstTy", "resolves an AST type to a backend type string"],
  ["placeTypeStr", "re-derives a place's type; returns \"\" on failure, read as \"skip\""],
  ["hintTy", "threads an expected type down the tree in place of a typed node"],
  ["Unlowered", "the sanctioned AST escape hatch in HIR — must reach zero"],
] as const;

function miloFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...miloFiles(p));
    else if (entry.name.endsWith(".milo")) out.push(p);
  }
  return out;
}

// A mention inside a comment is documentation, not a call site. Counting it would let
// this ratchet be satisfied by deleting prose, and would tick upward when someone
// explains the migration in a comment.
function stripComments(src: string): string {
  return src.split("\n").map(line => {
    const i = line.indexOf("//");
    return i >= 0 ? line.slice(0, i) : line;
  }).join("\n");
}

const files = miloFiles(SRC_MILO);
const counts: Record<string, number> = {};
const byFile: Record<string, Record<string, number>> = {};

for (const [name] of COUNTERS) counts[name] = 0;
for (const f of files) {
  const src = stripComments(readFileSync(f, "utf-8"));
  for (const [name] of COUNTERS) {
    const n = (src.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
    if (n === 0) continue;
    counts[name] += n;
    const rel = f.slice(MILO_ROOT.length + 1);
    (byFile[name] ??= {})[rel] = n;
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

for (const [name, why] of COUNTERS) {
  console.log(`${name.padEnd(14)} ${String(counts[name]).padStart(4)}   ${why}`);
  const spread = byFile[name];
  if (spread) {
    const top = Object.entries(spread).sort((a, b) => b[1] - a[1]);
    console.log(`${" ".repeat(19)}${top.map(([f, n]) => `${f.replace("src-milo/", "")}:${n}`).join("  ")}`);
  }
}
console.log(`${"TOTAL".padEnd(14)} ${String(total).padStart(4)}`);

type Baseline = {
  counts: Record<string, number>;
  total: number;
  commit: string;
  reason: string;
  note: string;
};

const commit = Bun.spawnSync(["git", "-C", MILO_ROOT, "rev-parse", "--short", "HEAD"])
  .stdout.toString().trim() || "unknown";

if (write) {
  const prev: Baseline | null = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, "utf-8")) : null;
  if (prev) {
    const raised = COUNTERS.filter(([n]) => counts[n] > prev.counts[n]);
    if (raised.length > 0 && !allowRaise) {
      console.error(`\nREFUSING TO RAISE THE BASELINE: ` +
        raised.map(([n]) => `${n} ${prev.counts[n]} → ${counts[n]}`).join(", ") + `\n` +
        `  This ratchet only goes down. If a slice genuinely has to add sites — introducing\n` +
        `  the Unlowered bridge is the one expected case — say so:\n` +
        `    bun scripts/hir-ratchet.ts --write --allow-raise --reason "slice 1: bridge introduced"`);
      process.exit(1);
    }
    if (raised.length > 0 && !reason) {
      console.error(`\n--allow-raise needs --reason "<why>" — it is recorded in the baseline.`);
      process.exit(1);
    }
  }
  const next: Baseline = {
    counts, total, commit, reason,
    note: "src-milo backend sites that re-derive frontend knowledge. Monotone down to zero. bun scripts/hir-ratchet.ts --check",
  };
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nbaseline written at ${commit}: total ${total}${reason ? ` (${reason})` : ""}`);
  process.exit(0);
}

if (check) {
  if (!existsSync(BASELINE)) {
    console.error(`\nno baseline at ${BASELINE} — create one with --write`);
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf-8")) as Baseline;
  const grew = COUNTERS
    .map(([n]) => [n, base.counts[n] ?? 0, counts[n]] as const)
    .filter(([, was, now]) => now > was);
  console.log(`\nvs baseline ${base.commit}: total ${base.total} → ${total}`);
  if (grew.length > 0) {
    console.error(`\nRATCHET BROKEN — these went up:\n` +
      grew.map(([n, was, now]) => `  ${n}  ${was} → ${now}`).join("\n") + `\n\n` +
      `Every one of these is the backend re-deriving something the checker already knew.\n` +
      `A slice is supposed to delete them, not add them. If this raise is the intended\n` +
      `cost of a slice, rebaseline explicitly:\n` +
      `  bun scripts/hir-ratchet.ts --write --allow-raise --reason "<why>"`);
    process.exit(1);
  }
  const shrank = COUNTERS
    .map(([n]) => [n, base.counts[n] ?? 0, counts[n]] as const)
    .filter(([, was, now]) => now < was);
  if (shrank.length > 0) {
    console.log(`progress: ${shrank.map(([n, was, now]) => `${n} ${was} → ${now}`).join(", ")}`);
    console.log(`rebaseline to lock it in: bun scripts/hir-ratchet.ts --write`);
  }
  console.log("RATCHET OK");
  process.exit(0);
}

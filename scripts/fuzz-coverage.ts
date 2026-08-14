#!/usr/bin/env bun
// Which surface forms can the ownership fuzzer actually emit?
//
//   bun scripts/fuzz-coverage.ts                  # census against tests/fixtures
//   bun scripts/fuzz-coverage.ts --cases 200      # bigger generated corpus
//   bun scripts/fuzz-coverage.ts --verbose        # per-kind counts, not just the gap
//
// scripts/fuzz-ownership.ts grades itself on findings, and a generator that never emits
// a form reports "no findings" for it forever — indistinguishable from a form the checker
// handles correctly. Every ownership hole this compiler has had was a move the checker
// could not SEE because of how it was spelled (a fork tail, a struct field, a method
// receiver), so the fuzzer's blind spots are the compiler's untested spellings.
//
// The reference corpus is tests/fixtures: human-written programs exercising the language
// on purpose. A node kind those reach and the generator never emits is a coverage gap
// with a name, and each one is a new entry in SHAPES rather than a redesign.
//
// The kind lists are DERIVED from src/ast.ts, not written down here. A hand-maintained
// list of node kinds is the same defect this measures — it goes stale the moment someone
// adds a form, and it goes stale silently.
import { readdirSync, readFileSync, rmSync, mkdtempSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";

const ROOT = join(import.meta.dir, "..");
const AST_TS = join(ROOT, "src", "ast.ts");
const FIXTURES = join(ROOT, "tests", "fixtures");
const argOf = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1]!, 10) : dflt;
};
const CASES = argOf("--cases", 120);
const VERBOSE = process.argv.includes("--verbose");

// ── the kind universe, read out of the AST definitions ───────────────────────

// `export interface ClosureExpr { kind: "Closure"; ... }` — the interface name and the
// kind string differ in at least one case, so the mapping has to be read, not assumed.
function interfaceKinds(src: string): Map<string, string> {
  const m = new Map<string, string>();
  const re = /export interface (\w+)[^{]*\{\s*kind:\s*"(\w+)"/g;
  for (const hit of src.matchAll(re)) m.set(hit[1]!, hit[2]!);
  return m;
}

// The members of `export type Expr = A | B | ...;`, which may wrap across lines.
function unionMembers(src: string, name: string): string[] {
  const start = src.indexOf(`export type ${name} =`);
  if (start < 0) throw new Error(`no 'export type ${name}' in ast.ts — has the AST been restructured?`);
  const end = src.indexOf(";", start);
  return src.slice(start, end).split("=")[1]!.split("|").map(s => s.trim()).filter(Boolean);
}

const astSrc = readFileSync(AST_TS, "utf-8");
const byInterface = interfaceKinds(astSrc);
const bodyKinds = new Set<string>();
for (const name of [...unionMembers(astSrc, "Expr"), ...unionMembers(astSrc, "Stmt")]) {
  const kind = byInterface.get(name);
  // A union member with no interface (a type alias, a re-export) is not a node kind and
  // is skipped rather than counted as an uncoverable gap.
  if (kind) bodyKinds.add(kind);
}
if (bodyKinds.size === 0) throw new Error("derived zero node kinds from ast.ts — the parse above is wrong, not the AST");

// Forms that cannot carry an owned value, so their absence is not an ownership gap: a
// scalar literal is Copy, and break/continue carry nothing at all. Deliberately the
// SHORTEST list that is defensible rather than the most accurate one — this fails OPEN,
// listing an arguable kind as a gap rather than hiding one. StringLit is NOT here: an
// owned UTF-8 buffer is exactly the thing that moves.
const SCALAR_ONLY = new Set(["IntLit", "FloatLit", "CharLit", "BreakStmt", "ContinueStmt"]);

// ── counting ─────────────────────────────────────────────────────────────────

function kindsIn(file: string): Map<string, number> {
  const counts = new Map<string, number>();
  const src = readFileSync(file, "utf-8");
  let ast: unknown;
  try {
    // Parse only. The checker would reject tests/errors and half the generated corpus by
    // design, and a form's spelling exists in the AST either way.
    ast = new Parser(new Lexer(src).tokenize(), src, file).parse();
  } catch {
    return counts; // unparseable input contributes nothing; it is not a coverage claim
  }
  const seen = new Set<object>();
  const walk = (n: unknown): void => {
    if (n === null || typeof n !== "object") return;
    if (seen.has(n as object)) return;
    seen.add(n as object);
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    const k = (n as { kind?: unknown }).kind;
    if (typeof k === "string") counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const v of Object.values(n as Record<string, unknown>)) walk(v);
  };
  walk(ast);
  return counts;
}

function census(files: string[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const f of files) {
    for (const [k, n] of kindsIn(f)) total.set(k, (total.get(k) ?? 0) + n);
  }
  return total;
}

const corpus = mkdtempSync(join(tmpdir(), "milo-fuzzcov-"));
try {
  console.log(`generating ${CASES} ownership-fuzz cases…`);
  execSync(`bun ${join(ROOT, "scripts", "fuzz-ownership.ts")} --cases ${CASES} --seed 4 --no-asan --corpus ${corpus}`,
    { stdio: ["pipe", "pipe", "pipe"] });

  const generated = readdirSync(corpus).filter(f => f.endsWith(".milo")).map(f => join(corpus, f));
  const fixtures = readdirSync(FIXTURES).filter(f => f.endsWith(".milo")).map(f => join(FIXTURES, f));
  if (generated.length === 0) throw new Error("the fuzzer wrote no corpus — --corpus is not doing what this expects");

  const gen = census(generated);
  const fix = census(fixtures);

  // A kind the hand-written corpus reaches and the generator never emits.
  const gaps = [...bodyKinds].filter(k => (fix.get(k) ?? 0) > 0 && (gen.get(k) ?? 0) === 0).sort();
  const covered = [...bodyKinds].filter(k => (gen.get(k) ?? 0) > 0).sort();
  // Reached by neither: not a fuzzer gap, but nothing is testing the spelling at all.
  const untouched = [...bodyKinds].filter(k => (fix.get(k) ?? 0) === 0 && (gen.get(k) ?? 0) === 0).sort();

  console.log(`\ncorpus: ${generated.length} generated, ${fixtures.length} fixtures`);
  console.log(`expression/statement kinds in src/ast.ts: ${bodyKinds.size}`);
  console.log(`  reached by the ownership fuzzer: ${covered.length}/${bodyKinds.size}` +
    ` (${Math.round((covered.length / bodyKinds.size) * 100)}%)`);
  console.log(`  reached by tests/fixtures:       ${[...bodyKinds].filter(k => (fix.get(k) ?? 0) > 0).length}/${bodyKinds.size}`);

  if (VERBOSE) {
    console.log("\nper kind (generated / fixtures):");
    for (const k of [...bodyKinds].sort()) {
      console.log(`  ${k.padEnd(16)} ${String(gen.get(k) ?? 0).padStart(6)} ${String(fix.get(k) ?? 0).padStart(7)}`);
    }
  }

  if (gaps.length) {
    const owning = gaps.filter(k => !SCALAR_ONLY.has(k));
    console.log(`\nGAPS — the fixtures reach these, the generator never emits them (${gaps.length},` +
      ` ${owning.length} of which can carry an owned value):`);
    for (const k of gaps) {
      console.log(`  ${SCALAR_ONLY.has(k) ? " " : "*"} ${k.padEnd(16)} ${String(fix.get(k)).padStart(5)} occurrences in fixtures`);
    }
    console.log("\n* = a spelling a move could hide in that the ownership fuzzer has never");
    console.log("tried. Each is a new entry in SHAPES in scripts/fuzz-ownership.ts, not a redesign.");
  } else {
    console.log("\nno gaps: the generator emits every form the fixtures do");
  }
  if (untouched.length) {
    console.log(`\nreached by NEITHER corpus (${untouched.length}): ${untouched.join(", ")}`);
  }
} finally {
  rmSync(corpus, { recursive: true, force: true });
}

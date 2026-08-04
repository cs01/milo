// Every walker over the AST `Stmt` union must be exhaustive.
//
// This exists because the same bug was found four times in one day, in four unrelated
// places, and every instance reported SUCCESS: a prover walker that never descended into
// expressions proved `ensures result == 0` for a function returning 100; the contract gate
// silently skipped 11 files; `safety.ts` passed a DO-178C DAL A profile on an `unsafe`
// block inside `let .. else`; and the cyclomatic-complexity counter measured a function
// 35% over the DAL A bound as complexity 2. None of them failed a test — a walker that
// does not look finds nothing, and finding nothing reads as "nothing wrong".
//
// A `default:` arm binding the scrutinee to `never` turns the NEXT missing statement kind
// into a compile error. That is the only mechanism here that scales: it costs one arm per
// switch and it cannot be forgotten, whereas remembering to update N walkers whenever the
// AST grows a node has already failed N times.
//
// Scope is deliberately the AST `Stmt` union. `HIRStmt` is a separate union with its own
// (looser) rules, and expression switches are frequently partial ON PURPOSE — a lowering
// that answers "is this translatable" returns UNSUPPORTED for everything it does not know,
// which is a safe default rather than a silent skip.
import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const SRC = join(import.meta.dir, "..", "src");

// Switches that are partial on purpose. Each needs a reason — the point is that declining
// to handle a kind is a stated decision, not a field someone forgot.
const ALLOWED: Record<string, string> = {};

function stmtKinds(): Set<string> {
  const ast = readFileSync(join(SRC, "ast.ts"), "utf-8");
  const union = ast.match(/^export type Stmt =(.*?);/ms);
  expect(union).not.toBeNull();
  const names = union![1].match(/\b[A-Z][A-Za-z]*\b/g) ?? [];
  const kinds = new Set<string>();
  for (const n of names) {
    const decl = ast.match(new RegExp(`export interface ${n}\\s*\\{[^}]*?kind: "([A-Za-z]+)"`, "s"));
    kinds.add(decl ? decl[1] : n);
  }
  return kinds;
}

// Kinds the AST has and HIR does not. HIRStmt shares only four names with the AST union
// (`Assign`, `ExprStmt`, `Return`, `UnsafeBlock`), so mentioning any of these is what
// identifies a switch as walking the AST. Derived rather than listed — a hardcoded list
// here would be the same fail-open shape this lint exists to forbid.
function astOnlyStmtKinds(astKinds: Set<string>): Set<string> {
  const hir = readFileSync(join(SRC, "hir.ts"), "utf-8");
  const union = hir.match(/^export type HIRStmt =(.*?)\n\n/ms);
  expect(union).not.toBeNull();
  const hirKinds = new Set([...union![1].matchAll(/kind: "([A-Za-z]+)"/g)].map(m => m[1]!));
  expect(hirKinds.size).toBeGreaterThan(5);
  return new Set([...astKinds].filter(k => !hirKinds.has(k)));
}

interface SwitchSite { file: string; line: number; labels: Set<string>; guarded: boolean }

// Blocks whose case labels name AST statement kinds. Brace counting is not viable here
// (codegen.ts emits LLVM IR, so `{` appears inside string literals); the switch's own
// indentation is the reliable delimiter.
function switchesOverStmts(file: string, kinds: Set<string>): SwitchSite[] {
  const src = readFileSync(join(SRC, file), "utf-8").split("\n");
  const out: SwitchSite[] = [];
  for (let i = 0; i < src.length; i++) {
    if (!/switch \(\s*[\w.?]*\bkind\s*\)/.test(src[i]!)) continue;
    const indent = " ".repeat(src[i]!.length - src[i]!.trimStart().length);
    const labels = new Set<string>();
    let guarded = false;
    for (let j = i + 1; j < src.length; j++) {
      if (new RegExp(`^${indent}\\}`).test(src[j]!)) break;
      for (const m of src[j]!.matchAll(/case "([A-Za-z]+)"/g)) labels.add(m[1]!);
      if (/:\s*never\b/.test(src[j]!)) guarded = true;
    }
    // Three or more statement kinds means it is walking statements, not matching one or
    // two special cases out of a wider union.
    if ([...labels].filter(l => kinds.has(l)).length >= 3) {
      out.push({ file, line: i + 1, labels, guarded });
    }
  }
  return out;
}

test("every AST statement walker has a never-guard", () => {
  const kinds = stmtKinds();
  expect(kinds.size).toBeGreaterThan(10); // guard against a broken union parse

  const files = readdirSync(SRC).filter(f => f.endsWith(".ts"));
  const sites = files.flatMap(f => switchesOverStmts(f, kinds));
  expect(sites.length).toBeGreaterThan(5); // guard against a broken switch scan

  const astOnly = astOnlyStmtKinds(kinds);
  const astWalkers = sites.filter(s => [...s.labels].filter(l => astOnly.has(l)).length >= 2);
  expect(astWalkers.length).toBeGreaterThan(5); // the scan must still find the known walkers

  const unguarded = astWalkers
    .filter(s => !s.guarded)
    .filter(s => !(`${s.file}:${s.line}` in ALLOWED))
    .map(s => `${s.file}:${s.line} (${[...s.labels].filter(l => kinds.has(l)).length} statement kinds)`);

  expect(unguarded.join("\n")).toBe("");
});

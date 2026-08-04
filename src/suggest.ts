// "Did you mean ...?" hints for the checker.
//
// Two independent sources, tried in order:
//   1. ALIASES — names from other languages that mean something here under a
//      different spelling. `arr.length`, `s.toUpperCase()`, `v.forEach(..)` are
//      not typos, so edit distance never finds them; they need a real table.
//   2. Edit distance against the receiver's actual members.
//
// Everything here is diagnostics-only: a stale entry costs a wrong suggestion,
// never a wrong compile. That's why the builtin member lists below are hand-kept
// rather than derived from the checker's dispatch chains.

import { existsSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";
import { STDLIB_DIR, bundledStdPaths, readStd } from "./stdlibBundle";

// Damerau-Levenshtein (optimal string alignment), bailing out once the best
// possible score exceeds `max`. The cap matters because this runs over every member
// of a type at error time. Transpositions count as one edit, not two: `nmae` for
// `name` is the single most common typo, and plain Levenshtein scores it 2 — past
// the threshold a 4-character name can afford.
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  // Three rows: i-2 is needed for the transposition step.
  let prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    const t = prev2; prev2 = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}

// Scaled to the name's length: one edit is a lot in `len`, three is little in
// `splitWhitespace`. Fixed thresholds either miss long typos or fire on short
// unrelated names.
function threshold(name: string): number {
  if (name.length <= 4) return 1;
  if (name.length <= 8) return 2;
  return 3;
}

// Best edit-distance match, or null when nothing is close enough. A
// case-insensitive exact match always wins — `toUppercase` vs `toUpperCase` is
// the same name, not a near miss.
export function closest(name: string, candidates: Iterable<string>): string | null {
  const max = threshold(name);
  const lower = name.toLowerCase();
  let best: string | null = null;
  let bestDist = max + 1;
  for (const c of candidates) {
    if (c === name) continue;
    if (c.toLowerCase() === lower) return c;
    const d = editDistance(name, c, max);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= max ? best : null;
}

// Names that exist under a different spelling in Milo. Keys are what a developer
// coming from TypeScript/JavaScript, Rust, Python, C++ or Java types by reflex;
// values are the Milo spelling. Only suggested when the value is actually a
// member of the receiver, so `length` on a struct with no `len` stays quiet.
const ALIASES: ReadonlyMap<string, string> = new Map([
  // TypeScript / JavaScript
  ["length", "len"],
  ["size", "len"],
  ["count", "len"],
  ["forEach", "each"],
  ["reduce", "fold"],
  ["reduceRight", "fold"],
  ["toUpperCase", "toUpper"],
  ["toLowerCase", "toLower"],
  ["includes", "contains"],
  ["some", "any"],
  ["every", "all"],
  ["trimLeft", "trimStart"],
  ["trimRight", "trimEnd"],
  ["padLeft", "padStart"],
  ["padRight", "padEnd"],
  ["shift", "remove"],
  ["splice", "remove"],
  ["unshift", "insert"],
  ["concat", "pushStr"],
  ["at", "charAt"],
  ["substring", "substr"],
  ["findIndex", "indexOf"],
  ["search", "indexOf"],
  ["sortWith", "sortBy"],
  // Rust
  ["push_str", "pushStr"],
  ["to_string", "toString"],
  ["to_owned", "clone"],
  ["is_empty", "isEmpty"],
  ["unwrap_or", "unwrapOr"],
  ["unwrap_or_else", "unwrapOrElse"],
  ["is_some", "isSome"],
  ["is_none", "isNone"],
  ["starts_with", "startsWith"],
  ["ends_with", "endsWith"],
  ["sort_by", "sortBy"],
  ["sort_by_key", "sortByKey"],
  ["last_index_of", "lastIndexOf"],
  ["char_at", "charAt"],
  ["to_lowercase", "toLower"],
  ["to_uppercase", "toUpper"],
  // Python
  ["append", "push"],
  ["extend", "push"],
  ["upper", "toUpper"],
  ["lower", "toLower"],
  ["strip", "trim"],
  ["lstrip", "trimStart"],
  ["rstrip", "trimEnd"],
  ["startswith", "startsWith"],
  ["endswith", "endsWith"],
  ["index", "indexOf"],
  // C++ / Java
  ["push_back", "push"],
  ["pop_back", "pop"],
  ["add", "push"],
  ["put", "insert"],
  ["erase", "remove"],
  ["front", "charAt"],
]);

// Members that Milo spells as an operator rather than a method. Suggesting a
// near-miss name here would send the reader looking for a method that will never
// exist, so these carry their own hint text.
const OPERATOR_FORMS: ReadonlyMap<string, string> = new Map([
  ["unwrap", "Milo spells this as the '!' suffix: 'x!' unwraps, panicking on None/Err"],
  ["expect", "Milo spells this as the '!' suffix: 'x!' unwraps, panicking on None/Err"],
  ["unwrapOrDefault", "use '??' for a default: 'x ?? fallback'"],
  ["orElse", "use '??' for a default: 'x ?? fallback'"],
  ["getOrElse", "use '??' for a default: 'x ?? fallback'"],
  ["equals", "compare with '==' — it is structural, not a reference check"],
]);

// Builtin members per receiver, for the types whose dispatch is a hand-written
// if-chain in the checker rather than a symbol table.
export const VEC_MEMBERS = [
  "push", "pop", "len", "get", "first", "last", "insert", "remove", "clear",
  "truncate", "swap", "extend", "retain", "map", "filter", "fold", "each",
  "enumerate", "find", "position", "indexOf", "any", "all", "sum", "min", "max",
  "join", "contains", "isEmpty", "sort", "sortBy", "sortByKey", "reverse",
  "slice", "clone", "capacity", "reserve",
] as const;

export const HASHMAP_MEMBERS = [
  "insert", "get", "getOrDefault", "remove", "contains", "len", "isEmpty", "clone",
  "clear", "keys", "values",
] as const;

export const STRING_MEMBERS = [
  "len", "push", "pushStr", "toUpper", "toLower", "trim", "trimStart", "trimEnd",
  "split", "splitView", "splitWords", "splitWhitespace", "lines", "contains",
  "startsWith", "endsWith", "indexOf", "indexOfFrom", "lastIndexOf", "replace",
  "replaceFirst", "padStart", "padEnd", "isEmpty", "charAt", "reverse", "repeat",
  "substr", "slice", "parseInt", "parseF64", "codePoints", "clone", "cstr",
] as const;

export const OPTION_MEMBERS = [
  "isSome", "isNone", "unwrapOr", "unwrapOrElse", "map",
] as const;

export const RESULT_MEMBERS = [
  "isOk", "isErr", "unwrapOr", "map", "mapErr", "andThen",
] as const;

// The hint for a member that doesn't exist on `receiver`. `candidates` is the
// receiver's real members; pass an empty list when they aren't enumerable and
// only the alias/operator tables should apply.
export function memberHint(name: string, candidates: Iterable<string>): string | undefined {
  const members = new Set(candidates);
  const alias = ALIASES.get(name);
  if (alias && members.has(alias)) return `did you mean '${alias}'?`;
  const op = OPERATOR_FORMS.get(name);
  if (op) return op;
  const near = closest(name, members);
  if (near) return `did you mean '${near}'?`;
  // The alias target isn't a member of this receiver, but naming it still beats
  // silence — it tells the reader what Milo calls the concept.
  if (alias) return `Milo spells this '${alias}'`;
  return undefined;
}

// ── Which std module exports a name ──────────────────────────────────────────
//
// A missing import and a typo produce the same "unknown type" at the use site,
// and the fix for the first is a line the compiler can write out in full. The
// scan is lexical (same basis as `milo api`) and built at most once per process,
// on the error path only — a clean compile never touches the filesystem here.

let STD_EXPORTS: Map<string, string[]> | null = null;

function walkMilo(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const p = resolve(dir, entry);
    if (statSync(p).isDirectory()) walkMilo(p, out);
    else if (entry.endsWith(".milo")) out.push(p);
  }
}

function stdExports(): Map<string, string[]> {
  if (STD_EXPORTS) return STD_EXPORTS;
  const index = new Map<string, string[]>();
  STD_EXPORTS = index;
  const stdDir = resolve(STDLIB_DIR, "std");
  const files: string[] = [];
  try {
    if (existsSync(stdDir)) walkMilo(stdDir, files);
    // bundledStdPaths resolves through the platform separator, so match on both.
    else files.push(...bundledStdPaths().filter(p => p.includes("/std/") || p.includes("\\std\\")));
  } catch { return index; }
  const decl = /^pub\s+(?:fn|struct|enum|type|const|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const f of files) {
    const src = readStd(f);
    if (src === null) continue;
    // std/platform.darwin.milo is imported as "std/platform" — the suffix picks
    // the arm at resolve time and never appears in source. Separators are forced to
    // '/' because this string goes straight into an import path the user will paste,
    // and `relative` hands back backslashes on Windows.
    const mod = relative(STDLIB_DIR, f)
      .replace(/\\/g, "/")
      .replace(/\.milo$/, "")
      .replace(/\.(darwin|linux|windows)$/, "");
    for (const m of src.matchAll(decl)) {
      const list = index.get(m[1]);
      if (!list) index.set(m[1], [mod]);
      else if (!list.includes(mod)) list.push(mod);
    }
  }
  return index;
}

// The import line that would bring `name` into scope, or null if no std module
// exports it. Ambiguity is reported rather than guessed at.
export function importHint(name: string): string | undefined {
  const mods = stdExports().get(name);
  if (!mods || mods.length === 0) return undefined;
  if (mods.length === 1) return `add the import: from "${mods[0]}" import { ${name} }`;
  return `'${name}' is exported by ${mods.map(m => `"${m}"`).join(", ")} — import it from one of them`;
}

// Names any std module exports, for spelling suggestions on an unknown type.
export function stdExportNames(): Iterable<string> {
  return stdExports().keys();
}

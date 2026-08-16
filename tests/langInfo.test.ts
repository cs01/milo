// Gate on `milo lang --json` — the language's vocabulary as a public, machine-readable
// surface, and on src/warnings.ts, the list it draws the warning names from.
//
// Everything here exists so that tooling OUTSIDE this repo (a tree-sitter grammar, an
// editor plugin, a third-party linter, a Milo-written tool, a future Rust or self-hosted
// compiler's tooling) can ask the compiler what the language contains instead of copying
// a list by hand. The docs site did copy one, and shipped `char`/`String`/`Box` — words
// Milo does not have — for months.
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { langInfo, LANG_JSON_SCHEMA } from "../src/lang-info";
import { KEYWORDS, SOFT_KEYWORDS } from "../src/tokens";
import { PRIMITIVE_TYPE_NAMES } from "../src/types";
import { BUILTIN_MEMBERS } from "../src/builtin-members";
import { WARNINGS, WARNING_NAMES, OFF_BY_DEFAULT } from "../src/warnings";

const ROOT = join(import.meta.dir, "..");
const CHECKER = readFileSync(join(ROOT, "src", "checker.ts"), "utf-8");

test("the CLI emits the same payload as the module, and it parses", () => {
  const out = execFileSync("bun", ["run", join(ROOT, "src", "main.ts"), "lang", "--json"], { encoding: "utf-8" });
  expect(JSON.parse(out)).toEqual(langInfo());
});

test("the payload carries every vocabulary the compiler has", () => {
  const info = langInfo();
  expect(info.schema).toBe(LANG_JSON_SCHEMA);
  expect(info.keywords.sort()).toEqual([...KEYWORDS].sort());
  expect(info.softKeywords.sort()).toEqual([...SOFT_KEYWORDS].sort());
  expect(info.primitiveTypes.sort()).toEqual([...PRIMITIVE_TYPE_NAMES].sort());
  expect(Object.keys(info.builtinMembers).sort()).toEqual(Object.keys(BUILTIN_MEMBERS).sort());
  // A payload that silently emptied would pass every "is it a subset" check.
  expect(info.keywords.length).toBeGreaterThan(20);
  expect(Object.values(info.symbols).length).toBeGreaterThan(20);
  expect(info.symbols.FatArrow).toBe("=>");
  // Literal classes are lexer concepts with no spelling — they must not leak in as
  // "symbols" a highlighter would try to match.
  expect(Object.values(info.symbols)).not.toContain("IDENT");
});

test("every warning the checker emits has a row in src/warnings.ts", () => {
  const emitted = [...CHECKER.matchAll(/\bwarn\("([a-z-]+)"/g)].map(m => m[1]!);
  expect(emitted.length).toBeGreaterThan(5); // the scan must find the call sites
  expect([...new Set(emitted)].filter(n => !WARNING_NAMES.includes(n)).sort()).toEqual([]);
});

test("every row in src/warnings.ts is a warning the checker emits", () => {
  // The other direction: a row for a warning that no longer exists sends a user to
  // `--deny=` a name the compiler will never produce.
  const mentioned = WARNING_NAMES.filter(n => CHECKER.includes(`"${n}"`));
  expect(WARNING_NAMES.filter(n => !mentioned.includes(n))).toEqual([]);
});

test("off-by-default matches the checker's allow-list", () => {
  const allowed = [...CHECKER.matchAll(/allowed\.add\("([a-z-]+)"\)/g)].map(m => m[1]!);
  expect(allowed.length).toBeGreaterThan(2);
  expect([...new Set(allowed)].sort()).toEqual([...OFF_BY_DEFAULT].sort());
});

test("the --deny-all help line is rendered, not retyped", () => {
  const help = execFileSync("bun", ["run", join(ROOT, "src", "main.ts"), "--help"], { encoding: "utf-8" });
  for (const name of OFF_BY_DEFAULT) expect(help).toContain(name);
  expect(WARNINGS.length).toBeGreaterThan(OFF_BY_DEFAULT.length);
});

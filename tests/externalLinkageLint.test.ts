// `@externalLinkage` and `pub` live in unrelated domains — the C linker and the module
// graph — and the combination "@externalLinkage without pub" is legal but usually a slip:
// the author wanted "visible from outside" and reached for the linkage attribute. It stays
// a WARNING because the legitimate case is real: a fn nothing in Milo references, resolved
// only by a dlopen'd library against this executable.
import { test, expect } from "bun:test";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/checker";

function lint(src: string): string[] {
  const prog = new Parser(new Lexer(src).tokenize(), src).parse();
  return new TypeChecker().check(prog).diagnostics
    .filter(d => d.code === "external-linkage-not-pub")
    .map(d => d.message);
}

test("flags @externalLinkage on a non-pub fn", () => {
  const out = lint(`@externalLinkage\nfn hidden(): i64 { return 1 }\nfn main(): void { print(hidden()) }\n`);
  expect(out.length).toBe(1);
  expect(out[0]).toContain("'hidden'");
});

test("says nothing when the fn is pub", () => {
  const out = lint(`@externalLinkage\npub fn shown(): i64 { return 2 }\nfn main(): void { print(shown()) }\n`);
  expect(out).toEqual([]);
});

test("says nothing without the attribute", () => {
  const out = lint(`fn plain(): i64 { return 3 }\nfn main(): void { print(plain()) }\n`);
  expect(out).toEqual([]);
});

// It is a warning, not an error: the dlopen case is legitimate and must still compile.
test("is a warning, so the program still checks", () => {
  const src = `@externalLinkage\nfn hidden(): i64 { return 1 }\nfn main(): void { print(hidden()) }\n`;
  const prog = new Parser(new Lexer(src).tokenize(), src).parse();
  const errs = new TypeChecker().check(prog).diagnostics.filter(d => d.severity === "error");
  expect(errs).toEqual([]);
});

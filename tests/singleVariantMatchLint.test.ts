// Unit tests for the single-variant-match lint. OFF by default while the tree is
// still being swept: a `match` whose only non-empty arm names one variant is an
// `if let`, and the empty arms exist only to satisfy exhaustiveness. The rewrite is
// mechanical because IfLetStmt runs the same borrow/consume path as a match arm.
import { test, expect } from "bun:test";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/checker";
import { mkdtempSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "milo-single-variant-lint-"));

function lint(body: string, cfg = { denied: new Set(["single-variant-match"]), allowed: new Set<string>() }) {
  const src = `enum Shape { Circle(i64), Square(i64), Tri }\n\nfn sink(x: i64) { print(x.toString()) }\n\nfn main() {\n${body}\n}\n`;
  const entry = join(dir, `t${Math.random().toString(36).slice(2)}.milo`);
  writeFileSync(entry, src);
  const prog = new Parser(new Lexer(src).tokenize(), src, entry).parse();
  return new TypeChecker(cfg).check(prog).diagnostics.filter(d => d.code === "single-variant-match");
}

const OPTION_ONE_ARM = `    let o = Option.Some(3)
    match o {
        Option.Some(s) => { sink(s) }
        Option.None => {}
    }`;

test("fires on a two-arm match whose None arm is empty", () => {
  const out = lint(OPTION_ONE_ARM);
  expect(out.length).toBe(1);
  expect(out[0].hint).toBe("write 'if let Option.Some(s) = o { … }' instead");
  expect(out[0].message).toContain("the other arm is empty");
  // caret covers the `match` keyword so a quickfix has the statement head to anchor on
  expect(out[0].len).toBe(5);
  expect(out[0].span?.line).toBe(7);
});

test("fires with more than two arms when all but one are empty", () => {
  const out = lint(`    let sh = Shape.Circle(2)
    match sh {
        Shape.Circle(r) => { sink(r) }
        Shape.Square(w) => {}
        Shape.Tri => {}
    }`);
  expect(out.length).toBe(1);
  expect(out[0].message).toContain("the other arms are empty");
  expect(out[0].hint).toContain("if let Shape.Circle(r) = sh");
});

test("does not fire when two arms both do work", () => {
  expect(lint(`    let o = Option.Some(3)
    match o {
        Option.Some(s) => { sink(s) }
        Option.None => { sink(0) }
    }`)).toEqual([]);
});

test("does not fire when the surviving arm is the wildcard", () => {
  // `if let Shape.Circle(r) = sh {} else { … }` is worse than the match it replaces.
  expect(lint(`    let sh = Shape.Tri
    match sh {
        Shape.Circle(r) => {}
        _ => { sink(9) }
    }`)).toEqual([]);
});

test("does not fire when every arm is empty", () => {
  expect(lint(`    let o = Option.Some(3)
    match o {
        Option.Some(s) => {}
        Option.None => {}
    }`)).toEqual([]);
});

test("does not fire on a match in value position", () => {
  // An empty arm cannot type-check there, so the shape never arises; the guard is
  // that the lint is statement-only and must not double-report a MatchExpr.
  expect(lint(`    let o = Option.Some(3)
    let n = match o {
        Option.Some(s) => { s }
        Option.None => { 0 }
    }
    sink(n)`)).toEqual([]);
});

test("is off by default", () => {
  expect(lint(OPTION_ONE_ARM, { denied: new Set<string>(), allowed: new Set<string>() })).toEqual([]);
});

test("--deny promotes it to an error", () => {
  const out = lint(OPTION_ONE_ARM);
  expect(out[0].severity).toBe("error");
});

test("names the subject as an ellipsis when it is not a place", () => {
  const out = lint(`    match Option.Some(3) {
        Option.Some(s) => { sink(s) }
        Option.None => {}
    }`);
  expect(out.length).toBe(1);
  expect(out[0].hint).toBe("write 'if let Option.Some(s) = … { … }' instead");
});

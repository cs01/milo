// Unit tests for the manual-shatter-cycle lint. `shatter` … `weld` written out by hand
// is correct, but it carries an obligation `parallelMap` does not: a window is a pointer
// into the owner's buffer, so dropping the owner while a worker holds one is a
// use-after-free, and `weld` can only notice the miss afterwards. The lint exists so the
// safer form is not merely available but pointed at — the ethos is guiding to correct
// programs, which means the compiler has to do the guiding, not the docs.
import { test, expect } from "bun:test";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/checker";

function lint(src: string): string[] {
  const prog = new Parser(new Lexer(src).tokenize(), src).parse();
  const cfg = { denied: new Set<string>(), allowed: new Set<string>() };
  return new TypeChecker(cfg).check(prog).diagnostics
    .filter(d => d.code === "manual-shatter-cycle")
    .map(d => d.message);
}

const STUBS = `
struct Shard { len: i64 }
struct Shards { n: i64 }
fn shatter(v: Vec<i64>, n: i64): Shards { return Shards { n: n } }
fn parallelMap(v: Vec<i64>, n: i64, f: (Shard) => Shard): Vec<i64> { return Vec.new() }
impl Shards {
    fn windows(self: &Self): Vec<Shard> { return Vec.new() }
    fn weld(self: &Self, back: Vec<Shard>): Vec<i64> { return Vec.new() }
}
`;

test("fires when a function shatters and welds by hand", () => {
  const out = lint(STUBS + `
pub fn main(): i32 {
    var v: Vec<i64> = Vec.new()
    let owner = shatter(v, 2)
    let w = owner.windows()
    let back = owner.weld(w)
    return 0
}`);
  expect(out).toEqual(["this shatters and welds by hand"]);
});

test("silent when the windows are taken but never welded here", () => {
  // Handing windows to someone else is the case the manual form is FOR, so pointing
  // at parallelMap there would be wrong: this caller cannot use it.
  const out = lint(STUBS + `
pub fn main(): i32 {
    var v: Vec<i64> = Vec.new()
    let owner = shatter(v, 2)
    let w = owner.windows()
    return 0
}`);
  expect(out).toEqual([]);
});

test("silent for the one-call form", () => {
  const out = lint(STUBS + `
fn work(s: Shard): Shard { return s }
pub fn main(): i32 {
    var v: Vec<i64> = Vec.new()
    let out = parallelMap(v, 4, work)
    return 0
}`);
  expect(out).toEqual([]);
});

test("the lint can be silenced for a project that wants the manual form", () => {
  const prog = new Parser(new Lexer(STUBS + `
pub fn main(): i32 {
    var v: Vec<i64> = Vec.new()
    let owner = shatter(v, 2)
    let back = owner.weld(owner.windows())
    return 0
}`).tokenize(), "").parse();
  const cfg = { denied: new Set<string>(), allowed: new Set(["manual-shatter-cycle"]) };
  const out = new TypeChecker(cfg).check(prog).diagnostics
    .filter(d => d.code === "manual-shatter-cycle");
  expect(out).toEqual([]);
});

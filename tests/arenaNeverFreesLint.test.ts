// Unit tests for the arena-never-frees lint. `Arena.get` returns Option<T> because a
// slot can be freed and reused; a program that never frees is unwrapping an Option that
// cannot be None at every call site. `sealGrowth()` removes exactly the operation being
// paid for and keeps `alloc`. See docs/ownership-patterns.md, pattern 2.
//
// The interesting half of this lint is where it stays QUIET. Advice that is wrong more
// often than right is worse than none, so it fires only when the whole life of the
// arena is visible: a local, never handed anywhere that could free it.
import { test, expect } from "bun:test";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/checker";

const STUBS = `
struct Handle { i: i64 }
struct Arena { n: i64 }
fn helper(x: Arena): void { }
impl Arena {
    fn new(): Arena { return Arena { n: 0 } }
    fn alloc(self: &mut Self, v: i64): Handle { return Handle { i: 0 } }
    fn get(self: &Self, h: Handle): Option<i64> { return Option.Some(0) }
    fn free(self: &mut Self, h: Handle): bool { return true }
    fn sealGrowth(self: Self): i64 { return 0 }
}
`;

function lint(body: string): string[] {
  const src = STUBS + `\npub fn main(): i32 {\n${body}\n    return 0\n}`;
  const prog = new Parser(new Lexer(src).tokenize(), src).parse();
  return new TypeChecker({ denied: new Set<string>(), allowed: new Set<string>() })
    .check(prog).diagnostics.filter(d => d.code === "arena-never-frees").map(d => d.message);
}

test("fires when a local arena is read but never freed", () => {
  expect(lint(`    var a: Arena = Arena.new()
    let h = a.alloc(1)
    let _v = a.get(h)`)).toEqual([
    "'a' is never freed, so every 'get' unwraps an Option that cannot be None",
  ]);
});

test("silent when the arena frees", () => {
  expect(lint(`    var a: Arena = Arena.new()
    let h = a.alloc(1)
    let _v = a.get(h)
    let _f = a.free(h)`)).toEqual([]);
});

test("silent once it is already sealed", () => {
  expect(lint(`    var a: Arena = Arena.new()
    let h = a.alloc(1)
    let _v = a.get(h)
    let _g = a.sealGrowth()`)).toEqual([]);
});

test("silent when handed to a function that might free it", () => {
  expect(lint(`    var a: Arena = Arena.new()
    let h = a.alloc(1)
    let _v = a.get(h)
    helper(a)`)).toEqual([]);
});

test("silent when the arena is never read — nothing to make infallible", () => {
  expect(lint(`    var a: Arena = Arena.new()
    let _h = a.alloc(1)`)).toEqual([]);
});

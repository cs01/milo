// `checker.fatal()` stops the check at the point where the invariant the rest of
// the code needs is the one that just failed. It is only usable if error RECOVERY
// survives it: a compiler that reports the first mistake and quits makes you
// recompile once per typo. These tests pin the recovery boundaries — one per
// statement in a function body, one per declaration above that — so a later
// `fatal()` added somewhere hot can't silently collapse a run to one diagnostic.
import { test, expect } from "bun:test";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/checker";

function errorsOf(src: string): string[] {
  const prog = new Parser(new Lexer(src).tokenize(), src).parse();
  return new TypeChecker()
    .check({ ...prog, entryFile: "test.milo" } as any)
    .diagnostics.filter(d => d.severity === "error")
    .map(d => d.message);
}

test("a fatal() in one statement does not swallow the next statement's error", () => {
  const errs = errorsOf(`struct Point {
    x: i64,
}

fn main() {
    var p = Point { x: 1 }
    alpha = 1
    p.nope = 2
    beta = 3
    3 = 4
    print(p.x)
}`);
  expect(errs.some(e => e.includes("undefined variable 'alpha'"))).toBe(true);
  expect(errs.some(e => e.includes("has no field 'nope'"))).toBe(true);
  expect(errs.some(e => e.includes("undefined variable 'beta'"))).toBe(true);
  expect(errs.some(e => e.includes("invalid assignment target"))).toBe(true);
});

test("a fatal() in one function does not swallow the next function's error", () => {
  const errs = errorsOf(`fn first() {
    missingA = 1
}

fn second() {
    missingB = 2
}

fn main() {
    first()
    second()
}`);
  expect(errs.some(e => e.includes("missingA"))).toBe(true);
  expect(errs.some(e => e.includes("missingB"))).toBe(true);
});

// The unwind jumps out of `pushScope`/`unsafe`/loop bodies mid-flight. If `recover`
// didn't rewind those stacks, the leftover depth would leak into the next function
// and change its answers — an `unsafe` op would stop needing a block, or a local
// from the abandoned scope would still resolve. Checked by putting the fatal inside
// all three at once and asserting the following function still checks normally.
// The assertions are all in the SAME function as the fatal, deliberately: a
// following function pushes its own scope floor, which hides a leaked scope by
// accident and would make this test pass without `recover` doing anything.
test("recovery rewinds scope, unsafe and loop depth", () => {
  const errs = errorsOf(`fn broken() {
    var i: i64 = 0
    while i < 3 {
        unsafe {
            let leaked = 1
            missingC = leaked
        }
        i = i + 1
    }
    print(leaked)
    let p = i.addrOf()
    break
}

fn main() {
    broken()
}`);
  expect(errs.some(e => e.includes("missingC"))).toBe(true);
  // `leaked` lived in the abandoned scope: still visible means scopes leaked.
  expect(errs.some(e => e.includes("undefined variable 'leaked'"))).toBe(true);
  // A leftover unsafeDepth would make this raw address-of legal outside `unsafe`.
  expect(errs.some(e => e.includes("requires 'unsafe' block"))).toBe(true);
  // A leftover loopDepth would make this `break` legal outside a loop.
  expect(errs.some(e => e.includes("'break' outside of loop"))).toBe(true);
});

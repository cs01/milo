// Cross-module name-collision semantics (issue #5): same-named top-level fns in
// different modules must not silently merge into one body. Different bodies are a
// compile error; identical bodies still merge; prelude override keeps working; and
// separately-compiled objects keep their own copies at link time (internal linkage).
import { test, expect } from "bun:test";
import { execSync, spawnSync } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const COMPILER = join(import.meta.dir, "..", "src", "main.ts");
const DIR = mkdtempSync(join(tmpdir(), "milo-modules-"));

// spawnSync (not execSync) so stderr is captured on BOTH exit paths — a non-fatal
// warning exits 0, and execSync only surfaces stderr on a non-zero exit.
function milo(args: string): { code: number; out: string; err: string } {
  const r = spawnSync("bun", ["run", COMPILER, ...args.split(" ").filter(Boolean)], { encoding: "utf-8" });
  return { code: r.status ?? 1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

function write(name: string, content: string): string {
  const p = join(DIR, name);
  writeFileSync(p, content);
  return p;
}

test("same-named fns with different bodies in two modules is a compile error", () => {
  write("dup_a.milo", `fn foo(): string { return "AAA" }\npub fn fromA(): string { return foo() }\n`);
  write("dup_b.milo", `fn foo(): string { return "BBB" }\npub fn fromB(): string { return foo() }\n`);
  const main = write("dup_main.milo", `from "dup_a" import { fromA }
from "dup_b" import { fromB }
fn main(): void {
    print(fromA())
    print(fromB())
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).not.toBe(0);
  const msg = r.err + r.out;
  expect(msg).toContain("defined in two modules with different bodies");
  expect(msg).toContain("dup_a.milo");
  expect(msg).toContain("dup_b.milo");
});

test("same-named fns with identical bodies still merge", () => {
  // `helper` stays private on purpose: it is defined identically in both files, so
  // each file's own reference to it is legal even after the flat namespace merges them.
  write("same_a.milo", `fn helper(): i64 { return 7 }\npub fn fromA(): i64 { return helper() }\n`);
  write("same_b.milo", `fn helper(): i64 { return 7 }\npub fn fromB(): i64 { return helper() }\n`);
  const main = write("same_main.milo", `from "same_a" import { fromA }
from "same_b" import { fromB }
fn main(): void {
    print(fromA() + fromB())
}
`);
  const r = milo(`run ${main}`);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("14");
});

test("identical bodies merge even when only one copy is pub", () => {
  // Visibility is not part of a body. `helper` is exported from one file and
  // private in the other; the merge must still see one implementation, and the
  // exported copy must stay importable from a third file.
  write("pubsame_a.milo", `pub fn helper(): i64 { return 7 }\npub fn fromA(): i64 { return helper() }\n`);
  write("pubsame_b.milo", `fn helper(): i64 { return 7 }\npub fn fromB(): i64 { return helper() }\n`);
  const main = write("pubsame_main.milo", `from "pubsame_a" import { fromA, helper }
from "pubsame_b" import { fromB }
fn main(): void {
    print(fromA() + fromB() + helper())
}
`);
  const r = milo(`run ${main}`);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("21");
});

test("user redefinition of a prelude fn (same signature) warns but still overrides", () => {
  // Same signature as std/string's strIndexOf, different body. Compiles — the sigs
  // match — but the flat namespace makes this body win everywhere, so it warns
  // (shadows-stdlib-override) rather than rebinding silently.
  const main = write("override_main.milo", `fn strIndexOf(haystack: &string, needle: &string): i64 { return -42 }
fn main(): void {
    print(strIndexOf("hello", "l"))
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("-42");
  expect(r.err).toContain("shadows a standard-library function");
});

test("user redefinition of a prelude fn with a DIFFERENT signature is a hard error", () => {
  // std/string's strTrim is (s: &string): string; this (s: string) mismatches, so
  // the library's own calls would break — rejected outright, not merely warned.
  const main = write("override_sig_main.milo", `fn strTrim(s: string): string { return "overridden" }
fn main(): void {
    print(strTrim("  x  "))
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).not.toBe(0);
  expect(r.err).toContain("shadows a standard-library function");
});

// The hades case: two separately-compiled objects whose imported helpers share a
// name but not a body. Each compilation is internally consistent, so no compile
// error is possible — internal linkage must keep each object's copy at link time
// (linkonce_odr let the linker discard one).
test("separately compiled objects keep their own same-named helper bodies", () => {
  write("obj_helper_a.milo", `pub fn tag(): i64 { return 111 }\n`);
  write("obj_helper_b.milo", `pub fn tag(): i64 { return 222 }\n`);
  const libA = write("obj_lib_a.milo", `from "obj_helper_a" import { tag }\nfn fromA(): i64 { return tag() }\nfn main(): void {}\n`);
  const libB = write("obj_lib_b.milo", `from "obj_helper_b" import { tag }\nfn fromB(): i64 { return tag() }\nfn main(): void {}\n`);
  const objA = join(DIR, "obj_a.o");
  const objB = join(DIR, "obj_b.o");
  let r = milo(`emit-obj ${libA} --no-entry -o ${objA}`);
  expect(r.code).toBe(0);
  r = milo(`emit-obj ${libB} --no-entry -o ${objB}`);
  expect(r.code).toBe(0);

  const cMain = write("obj_main.c", `#include <stdio.h>
extern long long fromA(void);
extern long long fromB(void);
int main(void) { printf("%lld %lld\\n", fromA(), fromB()); return 0; }
`);
  const bin = join(DIR, "obj_main");
  execSync(`cc ${cMain} ${objA} ${objB} -o ${bin}`, { stdio: ["pipe", "pipe", "pipe"] });
  const out = execSync(bin, { encoding: "utf-8" });
  expect(out.trim()).toBe("111 222");
});

// Regression: a type error in an *imported* module must be reported against that
// module's file/line/source — not misattributed to the entry file. Spans used to
// carry only line/col (no file), so the renderer pulled the caret from the entry
// source and printed e.g. "main.milo:105" (a blank line) for an error in an import.
test("type error in an imported module names the imported file, not the entry", () => {
  write("err_mod.milo", `pub fn bad(x: i64): i64 {
    let narrow: i32 = 2
    return x + narrow
}
`);
  // Pad the entry so the imported error's line number lands on unrelated entry
  // text — that mismatch is exactly what the old renderer exposed.
  const main = write("err_main.milo", `from "err_mod" import { bad }
// filler
// filler
// filler
// filler
fn main(): void {
    print(bad(5))
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).not.toBe(0);
  const msg = r.err + r.out;
  expect(msg).toContain("type mismatch in '+'");
  // Header points at the imported file, and the caret snippet is the imported
  // file's real source line — proof the right source was resolved.
  expect(msg).toContain("err_mod.milo:3");
  expect(msg).toContain("return x + narrow");
  // The entry file must NOT be blamed for the imported module's error.
  expect(msg).not.toContain("err_main.milo:");
});

// ── types and globals share the fn story: one flat namespace, last-wins ──
// The live case this closed: std/fetch's `pub struct Response` vs std/http's
// `pub enum Response`. Importing both compiled the enum and silently discarded
// the struct, so std/fetch's own code failed with "cannot access field on enum
// 'Response'" and "expected Response, got Response" — errors pointing at correct
// code, with nothing naming the collision.

test("a struct and an enum with the same name in two modules is a compile error", () => {
  write("ty_struct.milo", `pub struct Payload { code: i64 }\npub fn fromStruct(): Payload { return Payload { code: 1 } }\n`);
  write("ty_enum.milo", `pub enum Payload { Ok, Bad }\npub fn fromEnum(): Payload { return Payload.Ok }\n`);
  const main = write("ty_main.milo", `from "ty_struct" import { fromStruct }
from "ty_enum" import { fromEnum }
fn main(): void {
    print(fromStruct().code)
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).not.toBe(0);
  const msg = r.err + r.out;
  // Both kinds and both files, so the user can act without opening the compiler.
  expect(msg).toContain("'Payload' is defined as a struct in");
  expect(msg).toContain("and as an enum in");
  expect(msg).toContain("ty_struct.milo");
  expect(msg).toContain("ty_enum.milo");
});

test("same-named structs with different fields in two modules is a compile error", () => {
  write("tyd_a.milo", `pub struct Config { host: string }\npub fn hostOf(c: &Config): string { return c.host }\n`);
  write("tyd_b.milo", `pub struct Config { port: i64 }\npub fn portOf(c: &Config): i64 { return c.port }\n`);
  const main = write("tyd_main.milo", `from "tyd_a" import { Config, hostOf }
from "tyd_b" import { portOf }
fn main(): void {
    print(hostOf(Config { host: "x" }))
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).not.toBe(0);
  const msg = r.err + r.out;
  expect(msg).toContain("'Config' is defined as a struct in");
  expect(msg).toContain("tyd_a.milo");
  expect(msg).toContain("tyd_b.milo");
});

// The tolerance guard. Vendoring the same type into two modules is legitimate and
// must keep compiling — fns already get this and types must match them, or a
// future tightening breaks working code with no test to catch it.
test("byte-identical type definitions in two modules still merge", () => {
  write("tysame_a.milo", `pub struct Pt { x: i64, y: i64 }\npub fn fromA(): Pt { return Pt { x: 1, y: 2 } }\n`);
  write("tysame_b.milo", `pub struct Pt { x: i64, y: i64 }\npub fn fromB(): Pt { return Pt { x: 10, y: 20 } }\n`);
  const main = write("tysame_main.milo", `from "tysame_a" import { Pt, fromA }
from "tysame_b" import { fromB }
fn main(): void {
    let a = fromA()
    let b = fromB()
    print(a.x + a.y + b.x + b.y)
}
`);
  const r = milo(`run ${main}`);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("33");
});

test("identical enums merge even when only one copy is pub", () => {
  // Same laxity fns get: `isPub` is not part of a definition.
  write("tyenum_a.milo", `pub enum Color { Red, Blue }\npub fn fromA(): Color { return Color.Red }\n`);
  write("tyenum_b.milo", `enum Color { Red, Blue }\npub fn fromB(): bool { return fromBInner() == Color.Blue }\nfn fromBInner(): Color { return Color.Blue }\n`);
  const main = write("tyenum_main.milo", `from "tyenum_a" import { Color, fromA }
from "tyenum_b" import { fromB }
fn main(): void {
    print(fromA() == Color.Red)
    print(fromB())
}
`);
  const r = milo(`run ${main}`);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  expect(r.out.trim().split("\n")).toEqual(["true", "true"]);
});

test("same-named globals with different values in two modules is a compile error", () => {
  write("gl_a.milo", `let LIMIT: i64 = 10\npub fn fromA(): i64 { return LIMIT }\n`);
  write("gl_b.milo", `let LIMIT: i64 = 20\npub fn fromB(): i64 { return LIMIT }\n`);
  const main = write("gl_main.milo", `from "gl_a" import { fromA }
from "gl_b" import { fromB }
fn main(): void {
    print(fromA() + fromB())
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).not.toBe(0);
  const msg = r.err + r.out;
  expect(msg).toContain("'LIMIT' is defined as a global in");
  expect(msg).toContain("gl_a.milo");
  expect(msg).toContain("gl_b.milo");
});

test("identical globals in two modules still merge", () => {
  // std/sha1 and std/sha256 both hold `let MASK32: i64 = 0xffffffff` — this is
  // that shape, and it must stay legal.
  write("glsame_a.milo", `let MASKV: i64 = 255\npub fn fromA(): i64 { return MASKV }\n`);
  write("glsame_b.milo", `let MASKV: i64 = 255\npub fn fromB(): i64 { return MASKV }\n`);
  const main = write("glsame_main.milo", `from "glsame_a" import { fromA }
from "glsame_b" import { fromB }
fn main(): void {
    print(fromA() + fromB())
}
`);
  const r = milo(`run ${main}`);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  expect(r.out.trim()).toBe("510");
});

// Globals and fns share the value namespace — `@name` is one LLVM symbol either
// way. Before this check the only signal was clang's "redefinition of function
// '@asciiIsDigit'" against generated IR the user never wrote.
test("a global shadowing a stdlib function name is a compile error", () => {
  const main = write("glfn_main.milo", `let asciiIsDigit: i64 = 5
fn main(): void {
    print(asciiIsDigit)
}
`);
  const r = milo(`run ${main}`);
  expect(r.code).not.toBe(0);
  const msg = r.err + r.out;
  expect(msg).toContain("'asciiIsDigit' is defined as a function in 'std/string.milo'");
  expect(msg).toContain("and as a global in");
  expect(msg).not.toContain("redefinition of function");
});

// std ships as one flat namespace, so a private helper in one module can collide with
// a private helper in another and make the PAIR unimportable — `std/sha1` + `std/xxhash`
// both defined `rotl`, with different bodies, so any program wanting both failed to
// compile with an error naming neither of its own lines. That is invisible to per-module
// tests: each module is fine alone. One program importing the whole hazard set catches
// every such collision in a single compile, so this is the regression lock for the
// module-prefixed helper names (_xxRotl, _sha1Rotl, _uuidHexValue, _httpHexValue, ...).
test("the std modules with historically colliding private helpers import together", () => {
  const imports = [
    ["std/hex", "Hex"], ["std/http", "Param"], ["std/hmac", "Hmac"],
    ["std/sha1", "Sha1"], ["std/sha256", "Sha256"], ["std/uuid", "Uuid"],
    ["std/xxhash", "Xxhash"], ["std/process", "Process"], ["std/pty", "tiocgwinsz"],
    ["std/crypto", "Crypto"], ["std/base64", "Base64"], ["std/json", "JsonNode"],
  ];
  const src = imports.map(([m, n]) => `from "${m}" import { ${n} }`).join("\n");
  const main = write("std_flat_namespace.milo", `${src}\nfn main() { print("ok") }\n`);
  const r = milo(`emit-ir ${main} -o /dev/null`);
  expect(r.err).not.toContain("defined in two modules");
  expect(r.code).toBe(0);
});

test("cleanup", () => {
  rmSync(DIR, { recursive: true, force: true });
});

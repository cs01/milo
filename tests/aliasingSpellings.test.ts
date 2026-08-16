// The SPELLING matrix for the "mutation during iteration" rule.
//
// Distinct from tests/aliasingMatrix.test.ts, which is a golden matrix over containers
// x operations. This file varies how the same container is NAMED and how the loop body
// REACHES it, which is the axis the use-after-frees kept escaping along.
//
// Every use-after-free found in this checker in safe code has had one shape: an aliasing
// rule written against a node KIND rather than a place, so it covered the spelling its
// author was looking at and silently exempted the siblings. `for x in v` was rejected
// and `for x in b.items` was a heap-use-after-free, because the freeze only fired for a
// bare Ident.
//
// So the coverage question ("did I handle every spelling?") is answered here by
// generation instead of by memory. Each container is crossed with each way of NAMING it
// and each route by which the loop body can reach it. A rule that covers one spelling
// fails this file immediately rather than years later under ASan.
//
// Adding a container or a new root spelling means adding a row, not remembering to go
// re-audit the checker. See docs/plans/aliasing-coverage.md.
import { test, expect, describe } from "bun:test";
import { mkdtempSync } from "fs";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/checker";

const dir = mkdtempSync(join(tmpdir(), "milo-alias-"));
let n = 0;

function errorsFor(src: string): string[] {
  const entry = join(dir, `m${n++}.milo`);
  writeFileSync(entry, src);
  const prog = new Parser(new Lexer(src).tokenize(), src, entry).parse();
  return new TypeChecker().check(prog).diagnostics
    .filter(d => d.severity === "error").map(d => d.message);
}

type Container = {
  name: string;
  ty: string;
  init: string;
  /** seed the container so the loop has something to iterate */
  seed: (place: string) => string;
  /** the mutation that must be rejected inside the loop */
  mutate: (place: string) => string;
  /** loop bindings — a map yields two */
  bind: string;
};

const CONTAINERS: Container[] = [
  {
    name: "Vec",
    ty: "Vec<string>",
    init: "Vec.new()",
    seed: p => `${p}.push("a")`,
    mutate: p => `${p}.push("z")`,
    bind: "it",
  },
  {
    name: "HashMap",
    ty: "HashMap<string, string>",
    init: "HashMap.new()",
    seed: p => `${p}.insert("a", "b")`,
    mutate: p => `${p}.insert("z", "z")`,
    bind: "k, it",
  },
  {
    name: "Array",
    ty: "[string; 2]",
    init: `["a", "b"]`,
    seed: () => "",
    mutate: p => `${p}[0] = "z"`,
    bind: "it",
  },
];

type Root = {
  name: string;
  /** struct declarations this spelling needs */
  decls: (ty: string) => string;
  /** how `main` builds it */
  setup: (ty: string, init: string) => string;
  /** the binding the loop's root resolves to */
  owner: string;
  /** the owner's type, for a `&mut` parameter */
  ownerTy: (ty: string) => string;
  /** steps from the owner down to the container */
  path: string;
};

const ROOTS: Root[] = [
  {
    name: "local",
    decls: () => "",
    setup: (ty, init) => `    var c: ${ty} = ${init}`,
    owner: "c",
    ownerTy: ty => ty,
    path: "",
  },
  {
    name: "field",
    decls: ty => `struct Holder { c: ${ty} }`,
    setup: (_ty, init) => `    var h = Holder { c: ${init} }`,
    owner: "h",
    ownerTy: () => "Holder",
    path: ".c",
  },
  {
    name: "nested field",
    decls: ty => `struct Inner { c: ${ty} }\nstruct Outer { i: Inner }`,
    setup: (_ty, init) => `    var o = Outer { i: Inner { c: ${init} } }`,
    owner: "o",
    ownerTy: () => "Outer",
    path: ".i.c",
  },
];

const ROUTES = ["direct", "through a &mut fn"] as const;

function program(c: Container, r: Root, route: (typeof ROUTES)[number]): string {
  const place = r.owner + r.path;
  const seed = c.seed(place);
  const viaFn = route === "through a &mut fn";
  const touch = viaFn
    ? `fn touch(x: &mut ${r.ownerTy(c.ty)}) {\n    ${c.mutate("x" + r.path)}\n}\n`
    : "";
  const body = viaFn ? `touch(${r.owner})` : c.mutate(place);
  return `${r.decls(c.ty)}\n${touch}\nfn main() {\n${r.setup(c.ty, c.init)}\n${seed ? `    ${seed}\n` : ""}    for ${c.bind} in ${place} {\n        ${body}\n        print(it)\n    }\n}\n`;
}

describe("mutation during iteration is rejected for every spelling", () => {
  for (const c of CONTAINERS) {
    for (const r of ROOTS) {
      for (const route of ROUTES) {
        test(`${c.name} as a ${r.name}, mutated ${route}`, () => {
          const errs = errorsFor(program(c, r, route));
          // Either wording is the rule firing: a mutating METHOD reports the borrow,
          // an element ASSIGNMENT reports the iteration. Both are a rejection.
          expect(errs.join("\n")).toMatch(/is borrowed|being iterated/);
        });
      }
    }
  }
});

// The rule has to be precise as well as total: freezing the ROOT must not reject a
// mutation of a sibling field, or every `for x in self.items { self.count += 1 }` in the
// stdlib stops compiling. This is the half that a blunt "freeze the whole struct" fix
// would break, so it is asserted rather than assumed.
describe("a disjoint field of the same root still compiles", () => {
  for (const c of CONTAINERS) {
    test(`${c.name}: iterate one field, mutate another`, () => {
      const src = `struct Two { c: ${c.ty}, other: Vec<string>, n: i64 }\n\nfn main() {\n    var t = Two { c: ${c.init}, other: Vec.new(), n: 0 }\n${c.seed("t.c") ? `    ${c.seed("t.c")}\n` : ""}    for ${c.bind} in t.c {\n        t.other.push("ok")\n        t.n = t.n + 1\n        print(it)\n    }\n}\n`;
      expect(errorsFor(src)).toEqual([]);
    });
  }
});

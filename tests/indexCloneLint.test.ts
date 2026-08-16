// Unit tests for the index-clone lint. `let m = v[i]` on a non-Copy element is a deep
// copy — indexing clones so the container stays intact — and the SAME syntax is free or
// a malloc depending on a field of the element type that is invisible at the use site.
// OFF by default (binding an element out of a container is normal code paying a cost the
// author may well accept; 26 hits across src-milo alone would nag every self-host build)
// — opt in via `--deny=index-clone`, which is the audit it is meant to be.
import { test, expect } from "bun:test";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/checker";

// Opt the lint in (denied → the checker won't self-suppress it). Message text is
// identical whether it lands as warning or error, so filter by code.
function lint(src: string): string[] {
  const prog = new Parser(new Lexer(src).tokenize(), src).parse();
  const cfg = { denied: new Set(["index-clone"]), allowed: new Set<string>() };
  return new TypeChecker(cfg).check(prog).diagnostics
    .filter(d => d.code === "index-clone")
    .map(d => d.message);
}

const MARK = `struct Mark { name: string, n: i64 }\n`;
const FILL = `  var v: Vec<Mark> = Vec.new()\n  v.push(Mark { name: "a", n: 1 })\n`;

test("off by default — no opt-in, no diagnostic", () => {
  const src = `${MARK}fn main() {\n${FILL}  let m = v[0]\n  print(m.n)\n}\n`;
  const prog = new Parser(new Lexer(src).tokenize(), src).parse();
  expect(new TypeChecker().check(prog).diagnostics.filter(d => d.code === "index-clone")).toEqual([]);
});

test("flags a let binding of a struct element with heap fields", () => {
  const out = lint(`${MARK}fn main() {\n${FILL}  let m = v[0]\n  print(m.n)\n}\n`);
  expect(out.length).toBe(1);
  expect(out[0]).toContain("deep-copies the Mark");
});

test("flags a var binding the same way", () => {
  const out = lint(`${MARK}fn main() {\n${FILL}  var m = v[0]\n  print(m.n)\n}\n`);
  expect(out.length).toBe(1);
});

// A `return v[i]` allocates exactly like a binding does. It was invisible even with the
// lint on, because the check only ran where a value was BOUND — and `return b.v[0]` on a
// borrowed struct is the shape backlog #7 is about: the field spelling `return b.v` is a
// hard error, the index spelling silently deep-copies.
test("flags an index clone in return position", () => {
  const out = lint(`${MARK}fn first(v: &Vec<Mark>): Mark {\n  return v[0]\n}\nfn main(): void {\n${FILL}  print(first(v).n)\n}\n`);
  expect(out.length).toBe(1);
  expect(out[0]).toContain("deep-copies the Mark");
});

// A fork clones whichever arm runs, and the reader has no more reason to expect an
// allocation there than in the direct form. Both tails are reported: both can allocate.
test("flags both tails of a returned fork", () => {
  const out = lint(`${MARK}fn pick(v: &Vec<Mark>, c: bool): Mark {\n  return if c { v[0] } else { v[1] }\n}\nfn main(): void {\n${FILL}  print(pick(v, true).n)\n}\n`);
  expect(out.length).toBe(2);
});

test("a returned Copy element is still not flagged", () => {
  const out = lint(`fn first(v: &Vec<i64>): i64 {\n  return v[0]\n}\nfn main(): void {\n  var v: Vec<i64> = Vec.new()\n  v.push(1)\n  print(first(v))\n}\n`);
  expect(out).toEqual([]);
});

test("a Copy element is a register move, not an allocation", () => {
  const out = lint(`fn main() {\n  var v: Vec<i64> = Vec.new()\n  v.push(1)\n  let x = v[0]\n  print(x)\n}\n`);
  expect(out).toEqual([]);
});

// The whole point of the lint is that the cheap spelling already exists. If it fired on
// `for` too there would be nothing to point the reader at.
test("for-in binds by reference and is never flagged", () => {
  const out = lint(`${MARK}fn main() {\n${FILL}  for m in v {\n    print(m.n)\n  }\n}\n`);
  expect(out).toEqual([]);
});

test("a field read materialises no element", () => {
  const out = lint(`${MARK}fn main() {\n${FILL}  let n = v[0].n\n  print(n)\n}\n`);
  expect(out).toEqual([]);
});

test("a string element counts — the clone is a malloc per binding", () => {
  const out = lint(`fn main() {\n  var v: Vec<string> = Vec.new()\n  v.push("a")\n  let s = v[0]\n  print(s)\n}\n`);
  expect(out.length).toBe(1);
  expect(out[0]).toContain("deep-copies the string");
});

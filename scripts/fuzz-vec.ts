#!/usr/bin/env bun
// Differential falsifier for the built-in VEC — the growable array codegen.ts emits.
//
// Vec is the container Milo programs actually use (a survey of the corpus put it at 97%
// against fixed arrays), and like HashMap its bookkeeping lives in generated LLVM IR
// rather than in a .milo file: capacity doubling, the memmove that shifts a tail on
// insert/remove, truncate's drop loop, retain's compaction. Nothing type-checks any of it,
// and an off-by-one in a shift is silent — the program keeps running with a duplicated or
// dropped element.
//
// Unlike HashMap, Vec's order is fully determined, so the oracle asserts the ENTIRE
// contents after every mutation rather than a count and a checksum. That is the strongest
// oracle available here and it costs nothing extra.
//
// Usage: bun scripts/fuzz-vec.ts [--cases N] [--ops N] [--seed N] [--keep] [--verbose]
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const argOf = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1]!, 10) : dflt;
};
const CASES = argOf("--cases", 150);
const OPS = argOf("--ops", 45);
const SEED = argOf("--seed", 1);
const KEEP = process.argv.includes("--keep");
const VERBOSE = process.argv.includes("--verbose");

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

function genCase(seed: number): { src: string; expect: string[] } {
  const rnd = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const model: number[] = [];
  const body: string[] = [];
  const expect: string[] = [];
  let nextVal = 10;
  let dumpId = 0;

  // Print the whole vector. This is the assertion that catches a shift that moved one
  // element too many or too few — a length check alone would not.
  const dump = () => {
    const id = dumpId++;
    body.push(`    var d${id}: string = ""`);
    body.push(`    for x in v {`);
    body.push(`        d${id} = d${id} + x.toString() + ","`);
    body.push(`    }`);
    body.push(`    print("D" + v.len.toString() + "[" + d${id} + "]")`);
    expect.push(`D${model.length}[${model.map(x => `${x},`).join("")}]`);
  };

  for (let op = 0; op < OPS; op++) {
    const kind = pick([
      "push", "push", "push", "pop", "insert", "remove", "swap", "truncate",
      "reverse", "sort", "get", "clear", "retain", "extend", "sortBy", "sortByKey",
    ]);
    const n = model.length;

    if (kind === "push") {
      const val = nextVal++;
      body.push(`    v.push(${val})`);
      model.push(val);
    } else if (kind === "pop") {
      body.push(`    match v.pop() {`);
      body.push(`        Option.Some(x) => { print("P" + x.toString()) }`);
      body.push(`        Option.None => { print("Pnone") }`);
      body.push(`    }`);
      const x = model.pop();
      expect.push(x === undefined ? "Pnone" : `P${x}`);
    } else if (kind === "insert") {
      // Valid range is 0..len inclusive; an out-of-range insert traps by design and would
      // be testing the bounds check, not the shift.
      const at = Math.floor(rnd() * (n + 1));
      const val = nextVal++;
      body.push(`    v.insert(${at}, ${val})`);
      model.splice(at, 0, val);
    } else if (kind === "remove") {
      if (n === 0) { op--; continue; }
      const at = Math.floor(rnd() * n);
      body.push(`    print("R" + v.remove(${at}).toString())`);
      expect.push(`R${model.splice(at, 1)[0]}`);
    } else if (kind === "swap") {
      if (n === 0) { op--; continue; }
      const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n);
      body.push(`    v.swap(${a}, ${b})`);
      const t = model[a]!; model[a] = model[b]!; model[b] = t;
    } else if (kind === "truncate") {
      const to = Math.floor(rnd() * (n + 2));   // sometimes longer than len: a no-op
      body.push(`    v.truncate(${to})`);
      if (to < model.length) model.length = to;
    } else if (kind === "reverse") {
      body.push(`    v.reverse()`);
      model.reverse();
    } else if (kind === "sort") {
      body.push(`    v.sort()`);
      model.sort((x, y) => x - y);
    } else if (kind === "sortBy") {
      // Declared by VALUE on purpose. The checker allows it for a Copy element and
      // codegen must load; passing the pointer instead made this a no-op sort.
      body.push(`    v.sortBy((x: i64, y: i64): i32 => if x > y { 1 } else { 0 })`);
      model.sort((x, y) => x - y);
    } else if (kind === "sortByKey") {
      body.push(`    v.sortByKey((x: i64): i64 => 0 - x)`);
      model.sort((x, y) => y - x);
    } else if (kind === "clear") {
      body.push(`    v.clear()`);
      model.length = 0;
    } else if (kind === "retain") {
      // Keep the even values. retain compacts in place, which is its own shift loop.
      body.push(`    v.retain((x: i64): bool => x % 2 == 0)`);
      const kept = model.filter(x => x % 2 === 0);
      model.length = 0;
      model.push(...kept);
    } else if (kind === "extend") {
      const m = 1 + Math.floor(rnd() * 4);
      const vals: number[] = [];
      for (let i = 0; i < m; i++) vals.push(nextVal++);
      body.push(`    var ext${op}: Vec<i64> = [${vals.join(", ")}]`);
      body.push(`    v.extend(ext${op})`);
      model.push(...vals);
    } else if (kind === "get") {
      // Deliberately reaches past the end: get must answer None, not read off the buffer.
      const at = Math.floor(rnd() * (n + 3)) - 1;
      body.push(`    match v.get(${at}) {`);
      body.push(`        Option.Some(x) => { print("G" + x.toString()) }`);
      body.push(`        Option.None => { print("Gnone") }`);
      body.push(`    }`);
      const got = at >= 0 && at < model.length ? model[at] : undefined;
      expect.push(got === undefined ? "Gnone" : `G${got}`);
    }

    // Dump often — a corrupted element is far easier to attribute to one op than to a
    // run of forty.
    if (rnd() < 0.35) dump();
  }
  dump();

  const src = [
    `// generated by scripts/fuzz-vec.ts — seed ${seed}`,
    `pub fn main(): i32 {`,
    `    var v: Vec<i64> = []`,
    ...body,
    `    return 0`,
    `}`,
    ``,
  ].join("\n");
  return { src, expect };
}

const dir = mkdtempSync(join(tmpdir(), "milo-fuzzvec-"));
let failures = 0, ran = 0;
const t0 = Date.now();
try {
  for (let c = 0; c < CASES; c++) {
    const seed = SEED + c;
    const { src, expect } = genCase(seed);
    const file = join(dir, `case${seed}.milo`);
    writeFileSync(file, src);

    let out: string;
    try {
      out = execFileSync("bun", [join(ROOT, "src", "main.ts"), "run", file], {
        cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e: any) {
      failures++;
      console.error(`\nseed ${seed}: program failed to build or run\n${((e.stderr ?? "") + (e.stdout ?? "")).slice(0, 1200)}`);
      writeFileSync(join(ROOT, `vec-fuzz-${seed}.milo`), src);
      continue;
    }
    ran++;
    const actual = out.trim().split("\n").map(l => l.trim()).filter(l => l.length);
    if (actual.length !== expect.length || actual.some((l, i) => l !== expect[i])) {
      failures++;
      const at = actual.findIndex((l, i) => l !== expect[i]);
      console.error(`\nseed ${seed}: MODEL MISMATCH at line ${at + 1}`);
      console.error(`  expected: ${expect[at]}`);
      console.error(`  actual:   ${actual[at]}`);
      writeFileSync(join(ROOT, `vec-fuzz-${seed}.milo`), src);
      console.error(`case written to vec-fuzz-${seed}.milo`);
    } else if (VERBOSE) {
      console.log(`seed ${seed}: ${expect.length} observations agree`);
    }
  }
} finally {
  if (!KEEP) rmSync(dir, { recursive: true, force: true });
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nseed ${SEED}, ${CASES} cases (${OPS} ops each) in ${secs}s: ${ran} ran, ${failures} failed`);
if (ran === 0) {
  console.error("nothing ran — the harness is broken, not Vec");
  process.exit(2);
}
process.exit(failures ? 1 : 0);

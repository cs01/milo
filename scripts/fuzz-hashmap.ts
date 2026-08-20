#!/usr/bin/env bun
// Differential falsifier for the built-in HASHMAP — the open-addressing table codegen.ts
// emits, not a .milo file.
//
// HashMap is the only container whose bookkeeping lives entirely in generated LLVM IR:
// linear probing, a three-state slot byte (0 empty / 1 occupied / 2 tombstone), and a
// rehash that must drop tombstones while relocating every live entry. Nothing type-checks
// any of it. The dangerous interaction is delete-then-grow — a tombstone left in place
// across a rehash makes a probe stop early and a key that IS present read as absent.
//
// The oracle is a JS Map: every insert/get/remove/contains/len the generated program
// prints is predicted here. Iteration order is deliberately never asserted — Milo's
// HashMap seeds its hash per run, so any test that pinned an order would be testing the
// seed (see the note in CLAUDE.md about never deriving output order from a map).
//
// Usage: bun scripts/fuzz-hashmap.ts [--cases N] [--ops N] [--seed N] [--keys N] [--verbose]
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const argOf = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1]!, 10) : dflt;
};
const CASES = argOf("--cases", 100);
const OPS = argOf("--ops", 60);
const SEED = argOf("--seed", 1);
// A small key space is the point: it forces collisions, reuse of tombstoned slots, and
// repeated insert-over-existing, which a wide random key space almost never produces.
const KEYS = argOf("--keys", 12);
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

function genCase(seed: number, stringKeys: boolean): { src: string; expect: string[] } {
  const rnd = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const model = new Map<string, number>();
  const body: string[] = [];
  const expect: string[] = [];
  let nextVal = 1000;

  const keyOf = (i: number) => stringKeys ? `k${i}` : String(i);
  const keyLit = (k: string) => stringKeys ? `"${k}"` : k;

  for (let op = 0; op < OPS; op++) {
    const kind = pick([
      "insert", "insert", "insert", "get", "get", "contains", "remove", "remove", "len", "getOrDefault",
      // A burst inserts far more than the initial capacity in one go, so a rehash happens
      // with tombstones already in the table — the interaction this is hunting.
      "burst",
    ]);
    const k = keyOf(Math.floor(rnd() * KEYS));

    if (kind === "insert") {
      const v = nextVal++;
      body.push(`    m.insert(${keyLit(k)}, ${v})`);
      model.set(k, v);
    } else if (kind === "burst") {
      const n = 8 + Math.floor(rnd() * 24);
      for (let i = 0; i < n; i++) {
        const bk = keyOf(Math.floor(rnd() * KEYS));
        const v = nextVal++;
        body.push(`    m.insert(${keyLit(bk)}, ${v})`);
        model.set(bk, v);
      }
    } else if (kind === "get") {
      body.push(`    match m.get(${keyLit(k)}) {`);
      body.push(`        Option.Some(v) => { print("G" + v.toString()) }`);
      body.push(`        Option.None => { print("Gnone") }`);
      body.push(`    }`);
      expect.push(model.has(k) ? `G${model.get(k)}` : "Gnone");
    } else if (kind === "contains") {
      body.push(`    print("C" + (if m.contains(${keyLit(k)}) { "1" } else { "0" }))`);
      expect.push(`C${model.has(k) ? 1 : 0}`);
    } else if (kind === "remove") {
      // remove returns void, so the observable is what the table says afterwards —
      // which is the stronger check anyway: it reads through the probe that the
      // tombstone was just written into.
      body.push(`    m.remove(${keyLit(k)})`);
      model.delete(k);
      body.push(`    print("R" + (if m.contains(${keyLit(k)}) { "1" } else { "0" }))`);
      expect.push("R0");
    } else if (kind === "getOrDefault") {
      body.push(`    print("D" + m.getOrDefault(${keyLit(k)}, -7).toString())`);
      expect.push(`D${model.has(k) ? model.get(k) : -7}`);
    } else if (kind === "len") {
      body.push(`    print("L" + m.len.toString())`);
      expect.push(`L${model.size}`);
    }
  }

  // Final sweep over every key in the space, live or not. A probe that terminates early
  // on a stale tombstone shows up here even if the random ops never happened to read the
  // one key it hid.
  for (let i = 0; i < KEYS; i++) {
    const k = keyOf(i);
    body.push(`    print("F" + (if m.contains(${keyLit(k)}) { "1" } else { "0" }))`);
    expect.push(`F${model.has(k) ? 1 : 0}`);
  }
  body.push(`    print("L" + m.len.toString())`);
  expect.push(`L${model.size}`);
  // keys()/values() walk the slot array rather than probing, so they see tombstones the
  // probe never reaches. Counts only — HashMap seeds its hash per run, so any assertion
  // on ORDER would be testing the seed.
  body.push(`    print("K" + m.keys().len.toString() + ":" + m.values().len.toString())`);
  expect.push(`K${model.size}:${model.size}`);
  // for-in over a map is its own codegen path — it walks the slot array directly rather
  // than probing, so it sees tombstones the lookups never reach. Count and value-sum
  // only; the iteration ORDER is seed-dependent by design.
  body.push(`    var itn: i64 = 0`);
  body.push(`    var itsum: i64 = 0`);
  body.push(`    for _k, v in m {`);
  body.push(`        itn = itn + 1`);
  body.push(`        itsum = itsum + v`);
  body.push(`    }`);
  body.push(`    print("I" + itn.toString() + ":" + itsum.toString())`);
  let vsum = 0;
  for (const v of model.values()) vsum += v;
  expect.push(`I${model.size}:${vsum}`);

  const kt = stringKeys ? "string" : "i64";
  const src = [
    `// generated by scripts/fuzz-hashmap.ts — seed ${seed}, ${kt} keys`,
    `pub fn main(): i32 {`,
    `    var m: HashMap<${kt}, i64> = HashMap.new()`,
    ...body,
    `    return 0`,
    `}`,
    ``,
  ].join("\n");
  return { src, expect };
}

const dir = mkdtempSync(join(tmpdir(), "milo-fuzzhm-"));
let failures = 0, ran = 0;
const t0 = Date.now();
try {
  for (let c = 0; c < CASES; c++) {
    const seed = SEED + c;
    // Alternate key types: string keys hash bytes and compare by content, i64 keys hash
    // the word — two different emitKeyCompare paths through the same probe.
    const { src, expect } = genCase(seed, c % 2 === 0);
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
      writeFileSync(join(ROOT, `hm-fuzz-${seed}.milo`), src);
      continue;
    }
    ran++;
    const actual = out.trim().split("\n").map(l => l.trim()).filter(l => l.length);
    if (actual.length !== expect.length || actual.some((l, i) => l !== expect[i])) {
      failures++;
      const at = actual.findIndex((l, i) => l !== expect[i]);
      console.error(`\nseed ${seed}: MODEL MISMATCH at line ${at + 1} (${c % 2 === 0 ? "string" : "i64"} keys)`);
      console.error(`  expected: ${expect.slice(Math.max(0, at - 2), at + 3).join(" | ")}`);
      console.error(`  actual:   ${actual.slice(Math.max(0, at - 2), at + 3).join(" | ")}`);
      writeFileSync(join(ROOT, `hm-fuzz-${seed}.milo`), src);
      console.error(`case written to hm-fuzz-${seed}.milo`);
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
  console.error("nothing ran — the harness is broken, not the hashmap");
  process.exit(2);
}
process.exit(failures ? 1 : 0);

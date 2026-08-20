#!/usr/bin/env bun
// Differential falsifier for the GENERATIONAL ARENA — std/arena's Handle<T>.
//
// The arena is the one place in safe Milo where a use-after-free is caught at RUNTIME
// rather than by the checker: `free` bumps a slot's generation, and a handle carrying the
// old one must read as None. Everything that makes that work is bookkeeping — a free list
// that recycles slots LIFO, a sign convention where a negative generation means "free and
// reusable" and zero means "retired", and an arena id restamped by `clear`. Nothing in the
// type system holds any of it up; the ten hand-written fixtures pin the cases someone
// thought of.
//
// The oracle is a model of that bookkeeping, kept here in TypeScript, that predicts every
// observable the generated program prints. So this does not ask "did it crash" — it asks
// whether a stale handle ever answered as live, which is the bug that matters and the one
// a crash oracle cannot see.
//
// Usage: bun scripts/fuzz-arena.ts [--cases N] [--ops N] [--seed N] [--keep] [--verbose]
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const argOf = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1]!, 10) : dflt;
};
const CASES = argOf("--cases", 200);
const OPS = argOf("--ops", 40);
const SEED = argOf("--seed", 1);
const KEEP = process.argv.includes("--keep");
const VERBOSE = process.argv.includes("--verbose");

// xorshift — deterministic across runs and hosts, unlike Math.random.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

// ── The model: std/arena's bookkeeping, restated ─────────────────────────────
//
// gens[i] > 0  live, that generation      gens[i] < 0  free, next gen is -gens[i]
// gens[i] == 0 retired (max generation)   arenaId is restamped by clear()
interface MHandle { arenaId: number; index: number; generation: number }

class ArenaModel {
  id = 1;
  gens: number[] = [];
  vals: number[] = [];
  freeList: number[] = [];
  live = 0;

  alloc(v: number): MHandle {
    if (this.freeList.length > 0) {
      const idx = this.freeList.pop()!;
      this.vals[idx] = v;
      this.gens[idx] = -this.gens[idx]!;
      this.live++;
      return { arenaId: this.id, index: idx, generation: this.gens[idx]! };
    }
    const idx = this.gens.length;
    this.vals.push(v);
    this.gens.push(1);
    this.live++;
    return { arenaId: this.id, index: idx, generation: 1 };
  }
  private hit(h: MHandle): boolean {
    return h.arenaId === this.id && h.index >= 0 && h.index < this.gens.length
      && this.gens[h.index]! > 0 && this.gens[h.index] === h.generation;
  }
  valid(h: MHandle): boolean { return this.hit(h); }
  get(h: MHandle): number | null { return this.hit(h) ? this.vals[h.index]! : null; }
  set(h: MHandle, v: number): boolean {
    if (!this.hit(h)) return false;
    this.vals[h.index] = v;
    return true;
  }
  free(h: MHandle): boolean {
    if (!this.hit(h)) return false;
    // The max-generation retirement branch is unreachable at these op counts, but the
    // model keeps it so the two implementations stay comparable if that ever changes.
    if (this.gens[h.index]! < 2147483647) {
      this.gens[h.index] = -(this.gens[h.index]! + 1);
      this.freeList.push(h.index);
    } else {
      this.gens[h.index] = 0;
    }
    this.live--;
    return true;
  }
  // arenaHandles walks `data` in index order and emits one handle per slot whose
  // generation is positive. A collector's sweep is built on this, so a slot it skips is
  // a live object silently dropped — a different failure from a stale handle reading
  // live, and one only this op can reach.
  handles(): MHandle[] {
    const out: MHandle[] = [];
    for (let i = 0; i < this.gens.length; i++) {
      if (this.gens[i]! > 0) out.push({ arenaId: this.id, index: i, generation: this.gens[i]! });
    }
    return out;
  }
  clear(): void {
    this.id++;
    this.gens = []; this.vals = []; this.freeList = []; this.live = 0;
  }
}

// ── Generation ───────────────────────────────────────────────────────────────
function genCase(seed: number): { src: string; expect: string[] } {
  const rnd = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const model = new ArenaModel();
  const handles: MHandle[] = [];   // mirrors the generated program's `hs` Vec
  const body: string[] = [];
  const expect: string[] = [];
  let nextVal = 100;

  // Always start with something to reach for; a case that opens with `free` on an empty
  // handle list would spend its ops on nothing.
  const seedAllocs = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < seedAllocs; i++) {
    const v = nextVal++;
    body.push(`    hs.push(a.alloc(${v}))`);
    handles.push(model.alloc(v));
  }

  for (let op = 0; op < OPS; op++) {
    // `clear` is rare on purpose: it resets everything, so a common one would keep the
    // arena shallow and never build the stale-handle depth this is hunting for.
    const kind = rnd() < 0.06 ? "clear"
      : pick(["alloc", "get", "valid", "free", "set", "len", "get", "valid", "handles"]);
    const k = handles.length ? Math.floor(rnd() * handles.length) : -1;

    if (kind === "alloc") {
      const v = nextVal++;
      body.push(`    hs.push(a.alloc(${v}))`);
      handles.push(model.alloc(v));
    } else if (kind === "clear") {
      body.push(`    a.clear()`);
      body.push(`    print("C")`);
      model.clear();
      expect.push("C");
    } else if (kind === "len") {
      body.push(`    print("L" + a.len().toString())`);
      expect.push(`L${model.live}`);
    } else if (kind === "handles") {
      // Count AND value-sum: a handles() that returned the right number of wrong handles
      // (stale generation, off-by-one index) would pass a count-only check.
      // Each handles() op gets its own bindings — Milo has no shadowing, so reusing one
      // name across two ops in the same function body is a redeclaration error.
      const n = op;
      body.push(`    var hsum${n}: i64 = 0`);
      body.push(`    let snap${n} = a.handles()`);
      body.push(`    for i in 0..snap${n}.len {`);
      body.push(`        match a.get(snap${n}[i]) {`);
      body.push(`            Option.Some(v) => { hsum${n} = hsum${n} + v }`);
      body.push(`            Option.None => { hsum${n} = hsum${n} - 1 }`);
      body.push(`        }`);
      body.push(`    }`);
      body.push(`    print("H" + snap${n}.len.toString() + ":" + hsum${n}.toString())`);
      const hs2 = model.handles();
      const sum = hs2.reduce((acc, h) => acc + (model.get(h) ?? -1), 0);
      expect.push(`H${hs2.length}:${sum}`);
    } else if (k < 0) {
      op--;                        // nothing to address yet; do not burn the op
      continue;
    } else if (kind === "get") {
      body.push(`    match a.get(hs[${k}]) {`);
      body.push(`        Option.Some(v) => { print("G" + v.toString()) }`);
      body.push(`        Option.None => { print("Gnone") }`);
      body.push(`    }`);
      const g = model.get(handles[k]!);
      expect.push(g === null ? "Gnone" : `G${g}`);
    } else if (kind === "valid") {
      body.push(`    print("V" + (if a.valid(hs[${k}]) { "1" } else { "0" }))`);
      expect.push(`V${model.valid(handles[k]!) ? 1 : 0}`);
    } else if (kind === "free") {
      body.push(`    print("F" + (if a.free(hs[${k}]) { "1" } else { "0" }))`);
      expect.push(`F${model.free(handles[k]!) ? 1 : 0}`);
    } else if (kind === "set") {
      const v = nextVal++;
      body.push(`    print("S" + (if a.set(hs[${k}], ${v}) { "1" } else { "0" }))`);
      expect.push(`S${model.set(handles[k]!, v) ? 1 : 0}`);
    }
  }

  const src = [
    `// generated by scripts/fuzz-arena.ts — seed ${seed}`,
    `from "std/arena" import {`,
    `    Arena, Handle`,
    `}`,
    ``,
    `pub fn main(): i32 {`,
    `    var a = Arena<i64>.new()`,
    `    var hs: Vec<Handle<i64>> = []`,
    ...body,
    `    return 0`,
    `}`,
    ``,
  ].join("\n");
  return { src, expect };
}

// ── Run ──────────────────────────────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "milo-fuzzarena-"));
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
      console.error(`\nseed ${seed}: program failed to build or run\n${((e.stderr ?? "") + (e.stdout ?? "")).slice(0, 1500)}`);
      writeFileSync(join(ROOT, `arena-fuzz-${seed}.milo`), src);
      console.error(`case written to arena-fuzz-${seed}.milo`);
      continue;
    }
    ran++;
    const actual = out.trim().split("\n").map(l => l.trim()).filter(l => l.length);
    const want = expect;
    if (actual.length !== want.length || actual.some((l, i) => l !== want[i])) {
      failures++;
      const at = actual.findIndex((l, i) => l !== want[i]);
      console.error(`\nseed ${seed}: MODEL MISMATCH at line ${at + 1}`);
      console.error(`  expected: ${want.slice(Math.max(0, at - 2), at + 3).join(" | ")}`);
      console.error(`  actual:   ${actual.slice(Math.max(0, at - 2), at + 3).join(" | ")}`);
      writeFileSync(join(ROOT, `arena-fuzz-${seed}.milo`), src);
      console.error(`case written to arena-fuzz-${seed}.milo`);
    } else if (VERBOSE) {
      console.log(`seed ${seed}: ${want.length} observations agree`);
    }
  }
} finally {
  if (!KEEP) rmSync(dir, { recursive: true, force: true });
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nseed ${SEED}, ${CASES} cases (${OPS} ops each) in ${secs}s: ${ran} ran, ${failures} failed`);
// A generator that stops emitting observations would report zero mismatches forever.
if (ran === 0) {
  console.error("nothing ran — the harness is broken, not the arena");
  process.exit(2);
}
process.exit(failures ? 1 : 0);

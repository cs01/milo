#!/usr/bin/env bun
// Differential falsifier for INTEGER arithmetic across every width.
//
// Milo checks overflow by default and offers three explicit escapes per operation —
// wrapping*, saturating*, checked* — plus rotates, bit counts and `as` casts, for eight
// widths (i8..i64, u8..u64). That is a large matrix of width-dependent codegen, all of it
// emitted as LLVM IR, and every failure mode is a silently wrong NUMBER rather than a
// crash: a sign-extend where a zero-extend belonged, a saturate that clamps to the wrong
// bound, a rotate that shifts by more than the width.
//
// The oracle is BigInt with explicit masking, which is exact for every width including u64
// (where a JS number is not).
//
// Values are boundary-biased on purpose — MIN, MAX, 0, ±1, MIN+1, MAX-1 — because that is
// where wrapping and saturating differ from each other and from the checked form.
//
// Usage: bun scripts/fuzz-int.ts [--cases N] [--ops N] [--seed N] [--keep] [--verbose]
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const argOf = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1]!, 10) : dflt;
};
const CASES = argOf("--cases", 60);
const OPS = argOf("--ops", 40);
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

interface W { name: string; bits: number; signed: boolean }
const WIDTHS: W[] = [
  { name: "i8", bits: 8, signed: true }, { name: "i16", bits: 16, signed: true },
  { name: "i32", bits: 32, signed: true }, { name: "i64", bits: 64, signed: true },
  { name: "u8", bits: 8, signed: false }, { name: "u16", bits: 16, signed: false },
  { name: "u32", bits: 32, signed: false }, { name: "u64", bits: 64, signed: false },
];

const maskOf = (w: W) => (1n << BigInt(w.bits)) - 1n;
const minOf = (w: W) => (w.signed ? -(1n << BigInt(w.bits - 1)) : 0n);
const maxOf = (w: W) => (w.signed ? (1n << BigInt(w.bits - 1)) - 1n : maskOf(w));
// The value a bit pattern denotes in this width — the whole point of keeping the model in
// BigInt rather than Number, which cannot hold u64 exactly.
function reinterpret(v: bigint, w: W): bigint {
  const u = ((v % (1n << BigInt(w.bits))) + (1n << BigInt(w.bits))) % (1n << BigInt(w.bits));
  return w.signed && u >= 1n << BigInt(w.bits - 1) ? u - (1n << BigInt(w.bits)) : u;
}
const bits = (v: bigint, w: W) => ((v % (1n << BigInt(w.bits))) + (1n << BigInt(w.bits))) % (1n << BigInt(w.bits));
const clamp = (v: bigint, w: W) => (v < minOf(w) ? minOf(w) : v > maxOf(w) ? maxOf(w) : v);
const fits = (v: bigint, w: W) => v >= minOf(w) && v <= maxOf(w);

function values(w: W, rnd: () => number): bigint[] {
  const lo = minOf(w), hi = maxOf(w);
  const pool = [lo, lo + 1n, -1n, 0n, 1n, 2n, hi - 1n, hi];
  const extra = BigInt(Math.floor(rnd() * 1000)) % (hi - lo + 1n) + lo;
  return [...pool.filter(v => fits(v, w)), extra];
}

function genCase(seed: number): { src: string; expect: string[] } {
  const rnd = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const body: string[] = [];
  const expect: string[] = [];

  for (let op = 0; op < OPS; op++) {
    const w = pick(WIDTHS);
    const pool = values(w, rnd);
    const a = pick(pool), b = pick(pool);
    const id = `v${op}`;
    body.push(`    let ${id}a: ${w.name} = ${a}`);
    body.push(`    let ${id}b: ${w.name} = ${b}`);
    const tag = `${op}`;
    const kind = pick([
      "wrappingAdd", "wrappingSub", "wrappingMul", "wrappingNeg",
      "saturatingAdd", "saturatingSub", "saturatingMul",
      "checkedAdd", "checkedSub", "checkedMul", "checkedDiv", "checkedRem", "checkedNeg",
      "rotateLeft", "rotateRight", "reverseBits",
      "countOnes", "leadingZeros", "trailingZeros", "cast",
    ]);

    const say = (expr: string, want: bigint | string) => {
      body.push(`    print("${tag}:" + ${expr}.toString())`);
      expect.push(`${tag}:${want}`);
    };
    const sayOpt = (expr: string, want: bigint | null) => {
      body.push(`    match ${expr} {`);
      body.push(`        Option.Some(r) => { print("${tag}:" + r.toString()) }`);
      body.push(`        Option.None => { print("${tag}:none") }`);
      body.push(`    }`);
      expect.push(`${tag}:${want === null ? "none" : want}`);
    };

    if (kind === "wrappingAdd") say(`${id}a.wrappingAdd(${id}b)`, reinterpret(a + b, w));
    else if (kind === "wrappingSub") say(`${id}a.wrappingSub(${id}b)`, reinterpret(a - b, w));
    else if (kind === "wrappingMul") say(`${id}a.wrappingMul(${id}b)`, reinterpret(a * b, w));
    else if (kind === "wrappingNeg") say(`${id}a.wrappingNeg()`, reinterpret(-a, w));
    else if (kind === "saturatingAdd") say(`${id}a.saturatingAdd(${id}b)`, clamp(a + b, w));
    else if (kind === "saturatingSub") say(`${id}a.saturatingSub(${id}b)`, clamp(a - b, w));
    else if (kind === "saturatingMul") say(`${id}a.saturatingMul(${id}b)`, clamp(a * b, w));
    else if (kind === "checkedAdd") sayOpt(`${id}a.checkedAdd(${id}b)`, fits(a + b, w) ? a + b : null);
    else if (kind === "checkedSub") sayOpt(`${id}a.checkedSub(${id}b)`, fits(a - b, w) ? a - b : null);
    else if (kind === "checkedMul") sayOpt(`${id}a.checkedMul(${id}b)`, fits(a * b, w) ? a * b : null);
    else if (kind === "checkedNeg") sayOpt(`${id}a.checkedNeg()`, fits(-a, w) ? -a : null);
    else if (kind === "checkedDiv") {
      const bad = b === 0n || (w.signed && a === minOf(w) && b === -1n);
      // BigInt division truncates toward zero, which is what the hardware does too.
      sayOpt(`${id}a.checkedDiv(${id}b)`, bad ? null : a / b);
    } else if (kind === "checkedRem") {
      const bad = b === 0n || (w.signed && a === minOf(w) && b === -1n);
      sayOpt(`${id}a.checkedRem(${id}b)`, bad ? null : a % b);
    } else if (kind === "rotateLeft" || kind === "rotateRight") {
      const n = BigInt(Math.floor(rnd() * (w.bits * 2)));
      if (!fits(n, w)) { op--; continue; }
      const k = Number(n % BigInt(w.bits));
      const u = bits(a, w);
      const rotl = ((u << BigInt(k)) | (u >> BigInt(w.bits - k))) & maskOf(w);
      const rotr = ((u >> BigInt(k)) | (u << BigInt(w.bits - k))) & maskOf(w);
      const m = kind === "rotateLeft" ? "rotateLeft" : "rotateRight";
      body.push(`    let ${id}n: ${w.name} = ${n}`);
      say(`${id}a.${m}(${id}n)`, reinterpret(kind === "rotateLeft" ? rotl : rotr, w));
    } else if (kind === "reverseBits") {
      const u = bits(a, w);
      let r = 0n;
      for (let i = 0; i < w.bits; i++) if ((u >> BigInt(i)) & 1n) r |= 1n << BigInt(w.bits - 1 - i);
      say(`${id}a.reverseBits()`, reinterpret(r, w));
    } else if (kind === "countOnes") {
      const u = bits(a, w);
      let c = 0n;
      for (let i = 0; i < w.bits; i++) if ((u >> BigInt(i)) & 1n) c++;
      say(`${id}a.countOnes()`, c);
    } else if (kind === "leadingZeros") {
      const u = bits(a, w);
      let c = 0n;
      for (let i = w.bits - 1; i >= 0 && !((u >> BigInt(i)) & 1n); i--) c++;
      say(`${id}a.leadingZeros()`, c);
    } else if (kind === "trailingZeros") {
      const u = bits(a, w);
      let c = 0n;
      for (let i = 0; i < w.bits && !((u >> BigInt(i)) & 1n); i++) c++;
      say(`${id}a.trailingZeros()`, c);
    } else if (kind === "cast") {
      // `as` between integer widths: truncate to the target's bits, then read that pattern
      // in the target's signedness. Narrowing drops the high bits; widening from a signed
      // source sign-extends, from an unsigned source zero-extends — all of which is what
      // taking the source's VALUE and reinterpreting in the target width comes out to.
      const t = pick(WIDTHS);
      say(`(${id}a as ${t.name})`, reinterpret(a, t));
    }
  }

  const src = [
    `// generated by scripts/fuzz-int.ts — seed ${seed}`,
    `pub fn main(): i32 {`,
    ...body,
    `    return 0`,
    `}`,
    ``,
  ].join("\n");
  return { src, expect };
}

const dir = mkdtempSync(join(tmpdir(), "milo-fuzzint-"));
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
      writeFileSync(join(ROOT, `int-fuzz-${seed}.milo`), src);
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
      writeFileSync(join(ROOT, `int-fuzz-${seed}.milo`), src);
      console.error(`case written to int-fuzz-${seed}.milo`);
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
  console.error("nothing ran — the harness is broken, not the arithmetic");
  process.exit(2);
}
process.exit(failures ? 1 : 0);

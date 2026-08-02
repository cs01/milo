// The JS backend has no tests in this repo — it was only ever exercised by the
// emulators, which now live in their own. This is the smallest thing that keeps
// it honest: emit JS for a fixture, run it, and require the SAME stdout the
// native binary produces. A backend that agrees with itself proves nothing.
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MILO = join(import.meta.dir, "..", "src", "main.ts");

async function bothWays(src: string): Promise<{ native: string; js: string }> {
  const r = await runBoth(src);
  if (r.nativeFailed) throw new Error(r.nativeErr);
  if (r.jsFailed) throw new Error(r.jsErr);
  return { native: r.native, js: r.js };
}

interface BothResult {
  native: string; js: string;
  nativeErr: string; jsErr: string;
  nativeFailed: boolean; jsFailed: boolean;
}

function runBoth(src: string): BothResult {
  const dir = mkdtempSync(join(tmpdir(), "milo-emitjs-"));
  try {
    const milo = join(dir, "prog.milo");
    writeFileSync(milo, src);
    const native = Bun.spawnSync(["bun", "run", MILO, "run", milo]);
    const jsPath = join(dir, "prog.js");
    const emit = Bun.spawnSync(["bun", "run", MILO, "emit-js", milo, "-o", jsPath]);
    if (emit.exitCode !== 0) throw new Error(emit.stderr.toString() || emit.stdout.toString());
    const js = Bun.spawnSync(["bun", jsPath]);
    return {
      native: native.stdout.toString().trim(),
      js: js.stdout.toString().trim(),
      nativeErr: native.stderr.toString(),
      jsErr: js.stderr.toString(),
      nativeFailed: native.exitCode !== 0,
      jsFailed: js.exitCode !== 0,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Every runtime trap Milo guarantees has to fire in the JS backend too. It used to
// fire in none of them: the emitted program wrapped on overflow, produced Infinity
// on a divide by zero and `undefined` past the end of a Vec, and carried on. A
// second backend that silently keeps running where the binary aborts is worse than
// no second backend, because the answer it prints looks like an answer.
//
// Native's message carries a source location and JS's doesn't, so the assertion is
// that both fail and that native's message starts with the JS one — plus that
// whatever was printed before the trap is identical, since native writes stdout as
// it goes and a buffered JS runtime could lose it.
function bothTrap(src: string, message: string, stdoutBefore = "") {
  const r = runBoth(src);
  expect({ native: r.nativeFailed, js: r.jsFailed }).toEqual({ native: true, js: true });
  expect(r.jsErr).toContain(message);
  expect(r.nativeErr).toContain(message);
  expect(r.js).toBe(stdoutBefore);
  expect(r.native).toBe(stdoutBefore);
}

test("emit-js: integer overflow traps like native", () => {
  bothTrap(`
pub fn main(): i32 {
    var x: i32 = 2147483647
    print("before")
    x = x + 1
    print(x.toString())
    return 0
}
`, "integer overflow", "before");
});

test("emit-js: @wrapping opts out of the overflow trap in both backends", async () => {
  const r = await bothWays(`
@wrapping
fn bump(x: i32): i32 {
    return x + 1
}

pub fn main(): i32 {
    print(bump(2147483647).toString())
    // u8 wraps at its own width, not i32's.
    print((255 as u8).wrappingAdd(1 as u8).toString())
    return 0
}
`);
  expect(r.js).toBe(r.native);
  expect(r.native).toBe("-2147483648\n0");
});

test("emit-js: division by zero traps like native", () => {
  bothTrap(`
pub fn main(): i32 {
    var z: i64 = 0
    print((10 / z).toString())
    return 0
}
`, "division by zero");
});

test("emit-js: out-of-bounds index traps like native", () => {
  bothTrap(`
pub fn main(): i32 {
    var v: Vec<i64> = Vec.new()
    v.push(1)
    var i: i64 = 5
    print(v[i].toString())
    return 0
}
`, "array index out of bounds: 5/1");
});

test("emit-js: out-of-bounds store traps like native", () => {
  bothTrap(`
pub fn main(): i32 {
    var v: Vec<i64> = Vec.new()
    v.push(1)
    var i: i64 = 3
    v[i] = 9
    return 0
}
`, "array index out of bounds: 3/1");
});

test("emit-js: over-shift traps like native", () => {
  bothTrap(`
pub fn main(): i32 {
    var a: i32 = 1
    var s: i32 = 40
    print((a << s).toString())
    return 0
}
`, "shift amount out of range (>= 32)");
});

test("emit-js: unwrap on None traps like native", () => {
  bothTrap(`
pub fn main(): i32 {
    var v: Vec<i64> = Vec.new()
    print(v.pop()!.toString())
    return 0
}
`, "unwrap called on None");
});

test("emit-js: for-range evaluates its bounds once", async () => {
  // JS inlined `end` into the loop condition, so a body that changed it kept the
  // loop alive; native computes both bounds before entering.
  const r = await bothWays(`
pub fn main(): i32 {
    var n: i64 = 3
    var guard: i64 = 0
    for i in 0..n {
        n = n + 1
        guard = guard + 1
        if guard > 8 { break }
        print(i.toString())
    }
    return 0
}
`);
  expect(r.js).toBe(r.native);
  expect(r.native).toBe("0\n1\n2");
});

test("emit-js: strings are UTF-8 bytes, not UTF-16 code units", async () => {
  const r = await bothWays(`
pub fn main(): i32 {
    let s = "héllo"
    print(s.len.toString())
    // Indexing walks bytes: 'é' is the two bytes 195 169, not one code unit 233.
    let t = "hé"
    var i: i64 = 0
    while i < t.len {
        print(t[i].toString())
        i = i + 1
    }
    // Slice offsets are byte offsets too.
    print(s.substr(0, 3))
    return 0
}
`);
  expect(r.js).toBe(r.native);
  expect(r.native).toBe("6\n104\n195\n169\nhé");
});

test("emit-js: Vec.filled matches native", async () => {
  const r = await bothWays(`
struct P { x: i64, y: i64 }

pub fn main(): i32 {
    var a: Vec<i64> = Vec.filled(4, 7)
    a[1] = 9
    print(a.len.toString() + " " + a[0].toString() + " " + a[1].toString())
    // Every slot owns its own copy: writing through one must not show up in the
    // next. A JS Array.fill of one object aliases all of them.
    var b: Vec<P> = Vec.filled(3, P { x: 1, y: 2 })
    b[0].x = 100
    print(b[0].x.toString() + " " + b[1].x.toString() + " " + b[2].x.toString())
    var c: Vec<f64> = Vec.filled(2, 0.5)
    print((c[0] + c[1]).toString())
    // A count that is an expression, not a literal.
    let n = 2 + 1
    var d: Vec<i64> = Vec.filled(n * 2, 0)
    print(d.len.toString())
    return 0
}
`);
  expect(r.js).toBe(r.native);
  expect(r.native).toBe("4 7 9\n100 1 1\n1\n6");
});

test("emit-js: f32 rounds like native", async () => {
  const r = await bothWays(`
pub fn main(): i32 {
    // 0.1 is not representable in either width, and f32 rounds it further. JS
    // has one float type, so without Math.fround on the cast the JS backend
    // keeps f64 precision here and the two disagree.
    let a: f32 = 0.1 as f32
    let b: f64 = a as f64
    print((b > 0.1).toString())
    var v: Vec<f32> = Vec.filled(3, 0.0)
    v[0] = (1.0 / 3.0) as f32
    print(((v[0] as f64) == 1.0 / 3.0).toString())
    // A depth test: the stored f32 compared against the f64 that produced it.
    // This is the shape the rasteriser runs a million times a frame. 1/7 rounds
    // UP into f32, so the comparison is false — which is the point: the answer
    // depends on the rounding, and both backends have to get the same one.
    let z = 1.0 / 7.0
    v[1] = z as f32
    print(((v[1] as f64) < z).toString())
    return 0
}
`);
  expect(r.js).toBe(r.native);
  expect(r.native).toBe("true\nfalse\nfalse");
});

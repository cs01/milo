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
  const dir = mkdtempSync(join(tmpdir(), "milo-emitjs-"));
  try {
    const milo = join(dir, "prog.milo");
    writeFileSync(milo, src);
    const native = Bun.spawnSync(["bun", "run", MILO, "run", milo]);
    const jsPath = join(dir, "prog.js");
    const emit = Bun.spawnSync(["bun", "run", MILO, "emit-js", milo, "-o", jsPath]);
    if (emit.exitCode !== 0) throw new Error(emit.stderr.toString() || emit.stdout.toString());
    const js = Bun.spawnSync(["bun", jsPath]);
    if (native.exitCode !== 0) throw new Error(native.stderr.toString());
    if (js.exitCode !== 0) throw new Error(js.stderr.toString());
    return { native: native.stdout.toString().trim(), js: js.stdout.toString().trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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

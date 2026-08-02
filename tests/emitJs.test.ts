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

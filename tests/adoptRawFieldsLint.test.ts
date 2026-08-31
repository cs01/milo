// Gate on the adopt-raw-fields lint. `adopt<T>` hands back an owned `Heap<T>`, and a
// reader is entitled to assume dropping it frees the object — but a raw pointer FIELD
// owns nothing and has no drop glue, so an `extern struct` shaped like C's is freed
// without any of the memory it addresses. That limit is stated in docs/foreign-memory.md
// and demonstrated by tests/fixtures/adoptExternStructFields.milo; this makes the
// compiler say it at the call site.
//
// Driven through the CLI rather than the TypeChecker directly because the lint keys on
// the callee being std/foreign's own `adopt`, which only the resolver can establish.
import { test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const MILO_ROOT = join(import.meta.dir, "..");

function warningsFor(fixture: string): { code: string; message: string }[] {
  const r = spawnSync("bun", ["run", join(MILO_ROOT, "src/main.ts"), "check",
    join(MILO_ROOT, "tests/fixtures", fixture), "--json"], {
    cwd: MILO_ROOT, encoding: "utf-8", timeout: 180_000,
  });
  const payload = JSON.parse(r.stdout);
  return (payload.diagnostics ?? []).filter((d: any) => d.severity === "warning");
}

test("fires on an adopted struct with raw pointer fields", () => {
  const hits = warningsFor("adoptExternStructFields.milo").filter(d => d.code === "adopt-raw-fields");
  expect(hits.length).toBe(1);
  expect(hits[0].message).toContain("frees the GifLike itself and not what its raw pointer field(s) address");
});

test("silent on an adopted struct that owns nothing raw", () => {
  // Point is two i64s, so its drop frees everything there is to free. A lint that fired
  // here would be noise on the common case and get switched off wholesale.
  const hits = warningsFor("adoptRoundTrip.milo").filter(d => d.code === "adopt-raw-fields");
  expect(hits).toEqual([]);
});

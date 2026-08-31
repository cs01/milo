// The std/foreign intrinsics (rawSlice, rawSliceMut, adoptHeap, adoptVec) are restricted BY
// FILE: outside std/foreign.milo the name is an ordinary undefined function. The gate was a
// path SUFFIX match, so on Windows, where the resolver hands back `D:\a\milo\std\foreign.milo`,
// it never matched and every foreign fixture failed to compile with "undefined function
// 'adoptHeap'" - a feature silently removed on one platform while the macOS and Linux lanes
// stayed green. Nothing in the fixture lane can see that, because the lane runs on the host's
// own separator; this unit test is the only thing that does.
import { test, expect } from "bun:test";
import { isForeignModule, FOREIGN_MODULE } from "../src/checker";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

test("the foreign-module gate accepts both separators", () => {
  expect(isForeignModule("/Users/x/milo/std/foreign.milo")).toBe(true);
  expect(isForeignModule("D:\\a\\milo\\milo\\std\\foreign.milo")).toBe(true);
  expect(isForeignModule(FOREIGN_MODULE)).toBe(true);
});

test("it still rejects everything else", () => {
  // The point of the gate: an arbitrary file may not mint ownership of an address.
  expect(isForeignModule("/Users/x/milo/std/json.milo")).toBe(false);
  expect(isForeignModule("D:\\a\\milo\\src\\notforeign.milo")).toBe(false);
  // A file whose NAME merely ends the same way is not the module: the separator matters.
  expect(isForeignModule("/Users/x/milo/std/notstd/foreign.milo")).toBe(false);
  expect(isForeignModule(undefined)).toBe(false);
});

// The first fix went to the checker alone and Windows stayed red, because `lower.ts` has
// its OWN copy of the same gate: the checker accepted `rawSlice`, the lowering did not
// recognise it, and codegen emitted `call i32 @rawSlice` for a function that does not
// exist, which fails at link with no span. Two gates, one rule, and only one of them was
// fixed. So the rule is enforced on the source itself: the raw suffix test may not come
// back anywhere.
test("no source file compares the foreign module path by bare suffix", () => {
  const dir = join(import.meta.dir, "..", "src");
  const offenders: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts")) continue;
    const src = readFileSync(join(dir, f), "utf-8");
    // `isForeignModule` is the one place allowed to spell the comparison out.
    for (const [i, line] of src.split("\n").entries()) {
      if (line.includes("endsWith(FOREIGN_MODULE)") || line.includes(`endsWith("${FOREIGN_MODULE}")`)) {
        if (f === "checker.ts" && line.includes("posix.endsWith")) continue;
        offenders.push(`${f}:${i + 1}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

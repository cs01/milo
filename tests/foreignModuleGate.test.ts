// The std/foreign intrinsics (rawSlice, rawSliceMut, adoptHeap, adoptVec) are restricted BY
// FILE: outside std/foreign.milo the name is an ordinary undefined function. The gate was a
// path SUFFIX match, so on Windows, where the resolver hands back `D:\a\milo\std\foreign.milo`,
// it never matched and every foreign fixture failed to compile with "undefined function
// 'adoptHeap'" - a feature silently removed on one platform while the macOS and Linux lanes
// stayed green. Nothing in the fixture lane can see that, because the lane runs on the host's
// own separator; this unit test is the only thing that does.
import { test, expect } from "bun:test";
import { isForeignModule, FOREIGN_MODULE } from "../src/checker";

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

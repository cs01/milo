// Gate on the compile-pool budget policy. Both halves matter and neither is observable
// from a normal run: the budget only bites on a slow CI runner, and the warning only fires
// in the band between "comfortable" and "already failed".
import { test, expect } from "bun:test";
import { poolTimeoutMs, poolMarginWarning } from "./pool-budget";

test("the budget grows with the corpus rather than staying a fixed deadline", () => {
  // The flat 300s that used to be here is now a FLOOR, so a small corpus is unaffected...
  expect(poolTimeoutMs(100, false)).toBe(300_000);
  // ...and a large one gets room. 683 fixtures is where a linux runner hit the old flat
  // budget and the lane failed as an unnamed timeout.
  expect(poolTimeoutMs(683, false)).toBeGreaterThan(300_000);
  expect(poolTimeoutMs(2000, false)).toBeGreaterThan(poolTimeoutMs(1000, false));
  // Windows keeps its own floor and a bigger per-fixture allowance.
  expect(poolTimeoutMs(683, true)).toBeGreaterThan(poolTimeoutMs(683, false));
});

test("the margin warning fires in the band before the budget becomes a failure", () => {
  expect(poolMarginWarning("fixtures", 100_000, 300_000)).toBeNull();  // 33%, quiet
  expect(poolMarginWarning("fixtures", 239_000, 300_000)).toBeNull();  // 79%, still quiet
  const warned = poolMarginWarning("fixtures", 250_000, 300_000);      // 83%
  expect(warned).toContain("fixtures");
  expect(warned).toContain("83%");
  // A degenerate budget must not divide by zero into a warning nobody can act on.
  expect(poolMarginWarning("fixtures", 1, 0)).toBeNull();
});

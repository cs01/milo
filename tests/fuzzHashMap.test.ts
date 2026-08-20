// A short, fixed-seed run of the HashMap falsifier as a regression gate.
//
// HashMap's bookkeeping lives entirely in generated LLVM IR — linear probing, a
// three-state slot byte, a rehash that drops tombstones — so nothing type-checks it. This
// found a real one: `insert` stopped at the first tombstone instead of probing on, and
// wrote a duplicate of a key already present further down the chain.
//
// That bug reproduced in roughly 8% of random op sequences, because it needs a collision
// chain with a hole in it and the hash seed is drawn fresh per map. 40 cases is enough to
// make a regression very likely to show; tests/fixtures/hashmapTombstoneReuse.milo pins
// the same bug deterministically from the other direction.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

test("hashmap survives random insert/remove/grow sequences", () => {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bun", [
      join(ROOT, "scripts", "fuzz-hashmap.ts"),
      "--cases", "40",
      "--ops", "50",
      "--seed", "31",
    ], { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = e.status ?? 1;
  }
  // Assert it actually ran cases; the script exits 2 rather than 0 when it generates
  // nothing, but a zero mismatch count is meaningless without knowing the denominator.
  expect(out, `hashmap falsifier reported no cases:\n${out}`).toMatch(/\b40 ran\b/);
  expect(code, `hashmap falsifier found a mismatch:\n${out}`).toBe(0);
}, 300_000);

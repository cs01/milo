// A short, fixed-seed run of the Vec falsifier as a regression gate.
//
// Vec's bookkeeping is generated LLVM IR — capacity doubling, the memmove that shifts a
// tail on insert/remove, truncate's drop loop, retain's compaction. Unlike HashMap its
// order is fully determined, so the falsifier asserts the ENTIRE contents after every
// mutation rather than a count and a checksum.
//
// This found the by-value callback bug: `retain((x: i64): bool => x % 2 == 0)` filtered
// nothing, because codegen handed the closure a pointer and every heap pointer is even.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

test("vec survives random push/insert/remove/retain sequences", () => {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bun", [
      join(ROOT, "scripts", "fuzz-vec.ts"),
      "--cases", "30",
      "--ops", "40",
      "--seed", "5",
    ], { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = e.status ?? 1;
  }
  expect(out, `vec falsifier reported no cases:\n${out}`).toMatch(/\b30 ran\b/);
  expect(code, `vec falsifier found a mismatch:\n${out}`).toBe(0);
}, 300_000);

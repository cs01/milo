// A short, fixed-seed run of the integer falsifier as a regression gate.
//
// Milo checks overflow by default and offers wrapping/saturating/checked escapes for each
// operation across eight widths, plus rotates, bit counts and `as` casts. Every failure
// mode there is a silently wrong NUMBER — a sign-extend where a zero-extend belonged, a
// saturate that clamps to the wrong bound.
//
// It found one on its first case: signed saturatingMul clamped to MAX regardless of the
// product's sign, so (-2i8).saturatingMul(100) answered 127 instead of -128.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

test("integer arithmetic agrees with a BigInt model across widths", () => {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bun", [
      join(ROOT, "scripts", "fuzz-int.ts"),
      "--cases", "25",
      "--ops", "40",
      "--seed", "3",
    ], { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = e.status ?? 1;
  }
  expect(out, `integer falsifier reported no cases:\n${out}`).toMatch(/\b25 ran\b/);
  expect(code, `integer falsifier found a mismatch:\n${out}`).toBe(0);
}, 300_000);

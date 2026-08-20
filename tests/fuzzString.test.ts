// A short, fixed-seed run of the string falsifier as a regression gate.
//
// The built-in string methods are ~20 pieces of byte-offset arithmetic in generated LLVM
// IR — charAt, substr, indexOf/indexOfFrom/lastIndexOf, trim, repeat, reverse, replace.
// An off-by-one there returns a shorter string rather than crashing.
//
// ASCII inputs only, and never an empty needle: Milo's search methods are BYTE-indexed by
// design, so a JS string model is exact for ASCII, and the empty needle is a spec
// disagreement rather than an arithmetic one (see the note in the script).
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

test("string methods agree with a model over random op sequences", () => {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bun", [
      join(ROOT, "scripts", "fuzz-string.ts"),
      "--cases", "30",
      "--ops", "35",
      "--seed", "13",
    ], { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = e.status ?? 1;
  }
  expect(out, `string falsifier reported no cases:\n${out}`).toMatch(/\b30 ran\b/);
  expect(code, `string falsifier found a mismatch:\n${out}`).toBe(0);
}, 300_000);

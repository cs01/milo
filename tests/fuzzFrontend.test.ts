// A short, fixed-seed run of the frontend fuzzer as a regression gate.
//
// The two crashes this caught when it was written (a truncated declaration
// walking the parser past EOF, and a checker arity error falling through into
// the argument it just reported as missing) both have their own fixtures in
// tests/errors. This test is for the ones nobody has thought of yet: it asserts
// that mutated corpus files still produce diagnostics rather than raw JS
// exceptions, hangs, or spans pointing outside the source.
//
// Deliberately small. The real hunt is `bun scripts/fuzz-frontend.ts --cases
// 100000` with varied seeds, which belongs in a manual run, not in `bun test`.
//
// Fixed seed keeps mutation deterministic — but the corpus is the seed pool, so
// adding fixtures shifts which mutants get generated. A failure here after
// adding an unrelated fixture is a real finding that was always reachable, not
// flake.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

test("frontend survives mutated corpus input", () => {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bun", [
      join(ROOT, "scripts", "fuzz-frontend.ts"),
      "--cases", "600",
      "--seed", "1",
      "--no-reduce",
      "--out", ".fuzz-findings-test",
    ], { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = e.status ?? 1;
  }
  expect(code, `fuzzer found a confirmed frontend crash:\n${out}`).toBe(0);
}, 120_000);

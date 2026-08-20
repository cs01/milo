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

function fuzz(args: string[]): { out: string; code: number } {
  let out = "";
  let code = 0;
  try {
    out = execFileSync("bun", [join(ROOT, "scripts", "fuzz-frontend.ts"), ...args], {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = e.status ?? 1;
  }
  return { out, code };
}

test("frontend survives mutated corpus input", () => {
  const { out, code } = fuzz(["--cases", "600", "--seed", "1", "--no-reduce", "--out", ".fuzz-findings-test"]);
  expect(code, `fuzzer found a confirmed frontend crash:\n${out}`).toBe(0);
}, 120_000);

// Import resolution is a separate arm of the frontend and it was NOT swept until
// 2026-08-19: the first 40k-case run with --resolve turned up both of the resolver's
// import errors being raised as bare `throw new Error`, with no span and no source
// context, which is precisely the "raw JS exception instead of a diagnostic" contract
// this file exists to hold. Without this second test that arm has no gate, and the
// default (resolve-off) run cannot reach it no matter how many cases it runs.
test("import resolution survives mutated corpus input", () => {
  const { out, code } = fuzz([
    "--cases", "600",
    "--seed", "2",
    "--resolve",
    "--no-reduce",
    "--out", ".fuzz-findings-test",
  ]);
  expect(code, `fuzzer found a confirmed resolver crash:\n${out}`).toBe(0);
}, 120_000);

// Ratchet toward `noUncheckedIndexedAccess`.
//
// `arr[i]` is typed `T` when it is really `T | undefined`, and this is a compiler that
// indexes constantly — it is the single biggest remaining gap between this codebase's
// guarantees and Rust's. Turning the flag on wholesale means ~900 errors, so it stays off
// in the base tsconfig and this measures the debt instead.
//
// TWO counters, both ratcheted, and the second is the load-bearing one: the cheap way to
// "fix" an indexed-access error is `arr[i]!`, which silences the check rather than proving
// anything. Capping non-null assertions at the same time means the only way to lower the
// error count is to actually handle the undefined — a length check, a destructure with a
// default, or an explicit throw that names what was missing.
//
// Both numbers may only go DOWN. A drop is a hard failure too: lower the baseline in the
// same commit, so the ratchet can never silently slip back up later.
import { test, expect } from "bun:test";
import { execSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");

// Lower these as the debt is paid. Never raise them.
const MAX_INDEXED_ERRORS = 922;
const MAX_NONNULL_ASSERTIONS = 131;

function indexedAccessErrors(): number {
  try {
    execSync(`bunx tsc --noEmit -p ${join(ROOT, "tsconfig.indexed.json")}`, {
      cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    return 0; // clean — time to flip the flag on in tsconfig.json and delete this test
  } catch (e: any) {
    const out = (e.stdout ?? "") + (e.stderr ?? "");
    return out.split("\n").filter((l: string) => /^src\/.*error TS/.test(l)).length;
  }
}

// A `!` that is a non-null assertion, not `!=` and not a logical-not prefix: it follows an
// identifier, `)`, or `]`. String and comment contents are stripped first so a `!` inside a
// message or a regex is not counted.
const NON_NULL = /(?<=[\w)\]])!(?![=])/g;

function nonNullAssertions(): number {
  let total = 0;
  for (const f of readdirSync(SRC).filter(f => f.endsWith(".ts"))) {
    for (const line of readFileSync(join(SRC, f), "utf-8").split("\n")) {
      const code = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*/g, "");
      total += (code.match(NON_NULL) ?? []).length;
    }
  }
  return total;
}

test("indexed-access debt only goes down", () => {
  const n = indexedAccessErrors();
  expect(n).toBeLessThanOrEqual(MAX_INDEXED_ERRORS);
  if (n < MAX_INDEXED_ERRORS) {
    throw new Error(
      `indexed-access errors dropped to ${n} — lower MAX_INDEXED_ERRORS to ${n} in this file. ` +
      `Leaving the cap high lets it drift back up unnoticed.`,
    );
  }
}, 300000);

test("non-null assertions only go down", () => {
  const n = nonNullAssertions();
  expect(n).toBeLessThanOrEqual(MAX_NONNULL_ASSERTIONS);
  if (n < MAX_NONNULL_ASSERTIONS) {
    throw new Error(
      `non-null assertions dropped to ${n} — lower MAX_NONNULL_ASSERTIONS to ${n} in this file.`,
    );
  }
});

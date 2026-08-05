// Drives `milo test` over tests/milo-tests/ and asserts on what it reports. The runner's
// whole value is that a failing or trapping test does not silence the rest of the file, so
// the counts ARE the contract — a runner that swallowed a test and still printed a green
// summary is the silent-success shape this repo keeps getting bitten by.
import { test, expect, describe } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const MILO_ROOT = join(import.meta.dir, "..");
const TESTS_DIR = join(import.meta.dir, "milo-tests");

function runMiloTest(args: string[]): { code: number; out: string } {
  const r = spawnSync("bun", ["run", join(MILO_ROOT, "src/main.ts"), "test", ...args], {
    cwd: MILO_ROOT,
    encoding: "utf-8",
    timeout: 180_000,
  });
  // Strip ANSI so assertions match on text, not colour codes.
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  return { code: r.status ?? 1, out };
}

describe("milo test runner", () => {
  test("all-passing file reports every test and exits 0", () => {
    const { code, out } = runMiloTest([join(TESTS_DIR, "basics_test.milo")]);
    expect(out).toContain("4 pass, 0 fail");
    expect(out).toContain("testGenericEqualityAcrossTypes");
    expect(code).toBe(0);
  }, 180_000);

  // The reason for process-per-test. Under the old runner a trap ended the file and the
  // remaining tests were counted as passes.
  test("a trapping test does not stop the rest of its file", () => {
    const { code, out } = runMiloTest([join(TESTS_DIR, "isolationCases.milo")]);
    expect(out).toContain("2 pass, 2 fail");
    expect(out).toContain("testStillRunsAfterTheTrap");
    expect(out).toContain("out of bounds");
    expect(code).toBe(1);
  }, 180_000);

  test("failure output shows both sides of the assertion", () => {
    const { out } = runMiloTest([join(TESTS_DIR, "isolationCases.milo"), "-t", "testFailedAssertion"]);
    expect(out).toContain("assertEq failed: got 41, expected 42");
  }, 180_000);

  test("-t selects a subset and reports what it filtered out", () => {
    const { code, out } = runMiloTest([join(TESTS_DIR, "basics_test.milo"), "-t", "Inequality"]);
    expect(out).toContain("1 pass, 0 fail, 3 filtered out");
    expect(out).toContain("1 test in");
    expect(code).toBe(0);
  }, 180_000);

  test("-t accepts a regex", () => {
    const { out } = runMiloTest([join(TESTS_DIR, "basics_test.milo"), "-t", "^testFloats"]);
    expect(out).toContain("1 pass, 0 fail, 3 filtered out");
  }, 180_000);

  // A pattern that matches nothing is a typo, not a green run.
  test("a filter that matches nothing fails", () => {
    const { code, out } = runMiloTest([join(TESTS_DIR, "basics_test.milo"), "-t", "zzzNoSuchTest"]);
    expect(out).toContain("no test matched");
    expect(code).toBe(1);
  }, 180_000);

  // A directory sweep collects only `*_test.milo`, which is why the deliberately-failing
  // cases live under a name it does not match — a repo-wide `milo test` stays green.
  test("directory discovery collects only *_test.milo", () => {
    const { code, out } = runMiloTest([TESTS_DIR]);
    expect(out).toContain("4 pass, 0 fail");
    expect(code).toBe(0);
  }, 180_000);

  test("multiple explicit paths run in one session", () => {
    const { code, out } = runMiloTest([
      join(TESTS_DIR, "basics_test.milo"),
      join(TESTS_DIR, "isolationCases.milo"),
    ]);
    expect(out).toContain("6 pass, 2 fail");
    expect(code).toBe(1);
  }, 180_000);
});

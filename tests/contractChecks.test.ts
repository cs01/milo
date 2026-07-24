// `--contract-checks`: requires/ensures/invariant assert at ANY optimization level,
// independently of `--overflow-checks`.
//
// The two used to be one switch, so `--overflow-checks` silently turned contract asserts
// on and `--no-overflow-checks` silently turned them off. They answer different questions
// — what the machine does to your arithmetic vs a claim you wrote down — so the pairing
// is asserted in BOTH directions here: a release build with only `--overflow-checks` must
// NOT assert contracts, and a debug build with `--no-overflow-checks` must still do so.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const ROOT = join(import.meta.dir, "..");
const MAIN = join(ROOT, "src", "main.ts");
let dir = "";

// randRange keeps the argument out of reach of constant folding — a literal -1 is a
// compile error at every -O, which would test the checker instead of the codegen gate.
const SRC = `from "std/random" import { randRange }

pub fn takesNonNegative(n: i64): i64
requires n >= 0
{
    return n
}

fn main(): i32 {
    print(takesNonNegative(-1 * randRange(1, 2)))
    return 0
}
`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "milo-contract-"));
  writeFileSync(join(dir, "contract.milo"), SRC);
});
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

function build(out: string, extra: string[]) {
  execFileSync("bun", ["run", MAIN, "build", join(dir, "contract.milo"), "-o", join(dir, out), ...extra],
    { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
}

function run(bin: string): { out: string; code: number } {
  try {
    return { out: execFileSync(join(dir, bin), { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }), code: 0 };
  } catch (e: any) {
    return { out: (e.stdout ?? "") + (e.stderr ?? ""), code: e.status ?? 1 };
  }
}

test("release build drops contract asserts by default", () => {
  build("rel", ["--release"]);
  const r = run("rel");
  expect(r.code).toBe(0);
}, 120000);

test("--contract-checks asserts in a release build", () => {
  build("relChecked", ["--release", "--contract-checks"]);
  const r = run("relChecked");
  expect(r.code).not.toBe(0);
  expect(r.out).toContain("requires clause violated");
}, 120000);

test("--no-contract-checks drops the asserts in a debug build", () => {
  build("dbgUnchecked", ["--debug", "--no-contract-checks"]);
  const r = run("dbgUnchecked");
  expect(r.code).toBe(0);
}, 120000);

test("--overflow-checks alone does not turn contract asserts on", () => {
  build("relOvf", ["--release", "--overflow-checks"]);
  const r = run("relOvf");
  expect(r.code).toBe(0);
}, 120000);

test("--no-overflow-checks alone does not turn contract asserts off", () => {
  build("dbgNoOvf", ["--debug", "--no-overflow-checks"]);
  const r = run("dbgNoOvf");
  expect(r.code).not.toBe(0);
  expect(r.out).toContain("requires clause violated");
}, 120000);

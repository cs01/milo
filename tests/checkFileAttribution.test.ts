// A contract/overflow failure must name the file the CHECK is in, not the entry file.
//
// Every module merges into one LLVM module, and the failure message used to read from a
// single module-wide file constant set to the entry path. So a `requires` inside a std
// module — or any imported module — reported the user's main file with the imported
// file's line number: a location that exists but is the wrong code. That made a real
// contract violation indistinguishable from a bogus one, which is worse than no location.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const ROOT = join(import.meta.dir, "..");
const MAIN = join(ROOT, "src", "main.ts");
let dir = "";

// The contract lives in lib.milo; main.milo only calls it. Padding lines put the
// `requires` on a line number that also exists in main.milo, so an entry-file
// misattribution still points somewhere plausible rather than failing by accident.
const LIB = `// pad
// pad
// pad
// pad
// pad
pub fn half(n: i64): i64
requires n >= 0
{
    return n / 2
}
`;

const APP = `from "./lib" import { half }
fn main(): void {
    print(half(0 - 8))
}
`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "milo-checkfile-"));
  writeFileSync(join(dir, "lib.milo"), LIB);
  writeFileSync(join(dir, "main.milo"), APP);
});
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

test("a contract failure names the file the contract is in, not the entry file", () => {
  execFileSync("bun", ["run", MAIN, "build", join(dir, "main.milo"), "-o", join(dir, "app"), "--debug"],
    { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  try {
    execFileSync(join(dir, "app"), { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
  }
  expect(out).toContain("requires clause violated");
  expect(out).toContain("lib.milo:7");
  expect(out).not.toContain("main.milo");
}, 120000);

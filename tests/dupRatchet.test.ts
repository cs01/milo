// Duplication ratchet: the longest copy-paste run in src/ and std/ may not grow.
//
// scripts/dup-scan.ts on its own is a report, and a report nobody runs is not a routine.
// This is the gate: a cap on the LONGEST clone, not on the total, because the total moves
// for legitimate reasons (adding files) while a single long run is always someone pasting.
//
// Raising a cap is allowed — but do it in the commit that introduces the run, with the
// reason, rather than as a follow-up fix to a red build.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

// Set just above today's worst offender in each corpus so the gate is live, not slack:
// src/ is the 20-line pair shared by the vec and string arms of genForEach (extracting it
// needs a helper whose parameter list is as long as the duplication, so it stays);
// std/ is the 13-line stat-decoding run in std/fs.milo.
const CAPS = { "src/*.ts": 20, "std/*.milo": 13 };

for (const [glob, cap] of Object.entries(CAPS)) {
  test(`no clone longer than ${cap} lines in ${glob}`, () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync("bun", [
        join(ROOT, "scripts", "dup-scan.ts"),
        "--glob", glob,
        "--min", "10",
        "--top", "5",
        "--max-lines", String(cap),
      ], { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e: any) {
      out = (e.stdout ?? "") + (e.stderr ?? "");
      code = e.status ?? 1;
    }
    // A scanner that stops matching reports "0 files" and exits 0 forever. Assert it
    // actually read the corpus before trusting the verdict.
    expect(out, `dup-scan produced no file count for ${glob}:\n${out}`).toMatch(/^\d+ files, \d+ significant lines/);
    const files = Number(/^(\d+) files/.exec(out)![1]);
    expect(files, `dup-scan matched no files for ${glob}`).toBeGreaterThan(10);
    expect(code, `duplication grew past the cap:\n${out}`).toBe(0);
  }, 120_000);
}

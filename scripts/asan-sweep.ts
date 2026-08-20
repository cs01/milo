#!/usr/bin/env bun
// Is the code the MAIN compiler generates memory-safe?
//
// `milo build --sanitize` has existed for a long time and nothing ran it over the corpus.
// scripts/selfhost-asan.ts asks this question of milo-self's output; nobody asked it of the
// reference compiler's, so use-after-free, out-of-bounds and double-free in generated code
// had no gate at all. The leak gate cannot see any of those — it answers a different
// question, and answers it only for blocks big enough for `leaks` to notice.
//
//   bun scripts/asan-sweep.ts                 # sweep tests/fixtures
//   bun scripts/asan-sweep.ts --filter vec    # only fixtures whose name contains "vec"
//   bun scripts/asan-sweep.ts --verbose       # name every fixture as it runs
//
// Leak detection is OFF here on purpose: LeakSanitizer does not exist on darwin/arm64, and
// leaks are already ratcheted by scripts/leak-check.ts. This is for the errors ASan finds
// that a leak checker structurally cannot.
import { readdirSync, readFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const FIXTURES = join(ROOT, "tests", "fixtures");
const argv = process.argv.slice(2);
const filter = argv.includes("--filter") ? argv[argv.indexOf("--filter") + 1]! : null;
const VERBOSE = argv.includes("--verbose");

const names = readdirSync(FIXTURES)
  .filter(f => f.endsWith(".milo"))
  .filter(f => !filter || f.includes(filter))
  // Same contract as the fixture lane: a fixture that does not run on this OS is not a
  // memory-safety signal here either.
  .filter(f => !readFileSync(join(FIXTURES, f), "utf8").includes("@skip-os"));

const dir = mkdtempSync(join(tmpdir(), "milo-asan-"));
let ran = 0, buildFailed = 0;
const errors: { name: string; detail: string }[] = [];
const unbuildable: string[] = [];

try {
  for (const file of names) {
    const name = file.replace(/\.milo$/, "");
    const src = join(FIXTURES, file);
    const bin = join(dir, name);
    // A fixture with a companion .c is compiled together with it, exactly as the fixture
    // lane does — without that these nine link-fail and silently leave the sweep.
    const companion = src.replace(/\.milo$/, ".c");
    const args = ["run", join(ROOT, "src", "main.ts"), "build", src, "-o", bin, "--sanitize"];
    if (existsSync(companion)) args.push(companion);
    try {
      execFileSync("bun", args, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e: any) {
      buildFailed++;
      unbuildable.push(name);
      continue;
    }
    let out: string;
    try {
      out = execFileSync(bin, [], {
        cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ASAN_OPTIONS: "detect_leaks=0" },
      });
    } catch (e: any) {
      out = (e.stdout ?? "") + (e.stderr ?? "");
    }
    ran++;
    const m = /ERROR: AddressSanitizer: ([^\n]*)/.exec(out);
    if (m) errors.push({ name, detail: m[1]!.slice(0, 120) });
    else if (VERBOSE) console.log(`ok   ${name}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

for (const e of errors) console.log(`ASAN  ${e.name}: ${e.detail}`);
if (unbuildable.length) console.log(`\ncould not build under -fsanitize=address: ${unbuildable.join(", ")}`);
console.log(`\n${ran} fixtures ran under AddressSanitizer, ${buildFailed} could not build, ${errors.length} reported an error`);

// A sweep that builds nothing reports zero errors and exits 0 forever. Say so instead.
// Only on a FULL sweep: `--filter vec` is meant to run a handful.
if (!filter && ran < 300) {
  console.error(`only ${ran} fixtures ran (expected several hundred) — the sweep is not exercising the corpus`);
  process.exit(2);
}
process.exit(errors.length ? 1 : 0);

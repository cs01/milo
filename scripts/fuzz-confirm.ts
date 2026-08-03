// Re-runs one fuzz case on a fresh process's MAIN thread and reports the verdict
// as JSON on stdout.
//
// Exists because the fuzzer's cases execute in a Worker, whose stack is smaller
// than the main thread's. The parser's depth guard is calibrated to main-thread
// headroom, so deep-nesting inputs that a real `milo build` rejects cleanly can
// still blow the Worker's stack. Confirming every finding here keeps those
// harness artifacts out of the report — a finding that doesn't reproduce in a
// normal process isn't a compiler bug.
//
//   bun scripts/fuzz-confirm.ts case.milo [--resolve] [--source-dir DIR]
// exit 0 = clean, 3 = bug reproduced, 2 = usage error.
import { readFileSync } from "fs";
import { runCase } from "./fuzz-check";

const file = process.argv[2];
if (!file) {
  console.error("usage: bun scripts/fuzz-confirm.ts <case.milo> [--resolve] [--source-dir DIR]");
  process.exit(2);
}
const sdIdx = process.argv.indexOf("--source-dir");
const res = runCase(readFileSync(file, "utf-8"), {
  resolve: process.argv.includes("--resolve"),
  sourceDir: sdIdx >= 0 ? process.argv[sdIdx + 1] : undefined,
});
console.log(JSON.stringify(res));
process.exit(res.status === "bug" ? 3 : 0);

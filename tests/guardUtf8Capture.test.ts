// Captured output must survive a UTF-8 character landing on a chunk boundary.
//
// The guard accumulated a child's stdout with `stdout += d.toString()` on every `data`
// event, which decodes each chunk ALONE. A multi-byte character split across two chunks
// then decodes to replacement characters in both halves: `héllo → ok` cut inside the arrow
// arrives as `héllo ??? ok`. `milo run` captures through this path too, so any program
// printing non-ASCII could have its output corrupted, not just the test harness.
//
// It is timing-dependent, which is why it read as a flake: locally Bun hands over 180 KB
// in a single chunk and nothing splits. The child below forces the split deterministically
// by writing half a character, flushing, and writing the rest.
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { guardedRun } from "../scripts/guard";

const WORK = mkdtempSync(join(tmpdir(), "milo-utf8-"));

test("a UTF-8 character split across chunks is captured intact", async () => {
  // Node/Bun as the child, so this tests the CAPTURE and not the compiler. The delay is
  // what guarantees two separate `data` events.
  const script = join(WORK, "split.mjs");
  writeFileSync(script, [
    `const full = Buffer.from("héllo → ok\\n", "utf8");`,
    `const cut = full.indexOf(Buffer.from("→", "utf8")) + 1;`,
    `process.stdout.write(full.subarray(0, cut));`,
    `setTimeout(() => process.stdout.write(full.subarray(cut)), 60);`,
  ].join("\n"));

  const r = await guardedRun(process.execPath, [script], { virtualMemMb: 2048, timeoutMs: 30_000 });

  expect({
    stdout: r.stdout.trim(),
    replacementChars: (r.stdout.match(/�/g) ?? []).length,
  }).toEqual({ stdout: "héllo → ok", replacementChars: 0 });

  rmSync(WORK, { recursive: true, force: true });
}, 60_000);

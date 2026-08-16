// Synchronous stdout, for command output that a caller pipes.
//
// `process.stdout.write()` to a PIPE is asynchronous, and `process.exit()` does not
// drain it — so a large payload is silently truncated exactly when a tool consumes it,
// while the same command redirected to a file or a terminal (both synchronous) looks
// perfect. `milo api --json` lost its last 6 KB this way: valid JSON on screen,
// "Unterminated string" through execFileSync.
//
// writeFileSync on fd 1 is the fix: it returns only once the bytes are handed over.
import { writeFileSync } from "fs";

export function writeStdout(text: string): void {
  writeFileSync(1, text);
}

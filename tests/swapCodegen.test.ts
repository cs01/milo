// IR regression coverage for aggregate swap's runtime alias guard.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const MAIN = join(ROOT, "src", "main.ts");

test("large aggregate self-swap skips overlapping memcpy", () => {
  const dir = mkdtempSync(join(tmpdir(), "milo-swap-"));
  try {
    const source = join(dir, "swap.milo");
    writeFileSync(source, `struct Big { data: [u8; 256] }
fn main() {
    var values = [Big { data: [1; 256] }]
    var i: i64 = 0
    var j: i64 = 0
    swap(values[i], values[j])
}`);
    const ir = execFileSync("bun", ["run", MAIN, "emit-ir", source], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(ir).toMatch(/icmp eq ptr .*\n  br i1 .*label %swap\.done.*, label %swap\.copy/);
    expect(ir.indexOf("swap.copy")).toBeLessThan(ir.indexOf("@llvm.memcpy", ir.indexOf("swap.copy")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

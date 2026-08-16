// Host/target resolution, and the Windows cross-compile path.
//
// `getHostTarget()` used to fall through to the Linux entry for ANY non-darwin host,
// so on Windows the compiler reported x86_64-unknown-linux-gnu and emitted ELF-targeting
// IR: it didn't fail, it lied. Windows is a real target now; every other unknown host
// must still be refused explicitly rather than silently mislabelled.
import { test, expect } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { hostTargetFor, getHostTarget, resolveTarget, UnsupportedHostError } from "../src/target";

const ROOT = join(import.meta.dir, "..");
// `wine --version` rather than a PATH lookup: a broken install should skip, not fail.
const hasWine = spawnSync("wine", ["--version"], { encoding: "utf-8" }).status === 0;
const MAIN = join(ROOT, "src", "main.ts");

test("hosts resolve to their native triple", () => {
  expect(hostTargetFor("darwin", "arm64").triple).toBe("aarch64-apple-darwin");
  expect(hostTargetFor("darwin", "x64").triple).toBe("x86_64-apple-darwin");
  expect(hostTargetFor("linux", "arm64").triple).toBe("aarch64-unknown-linux-gnu");
  expect(hostTargetFor("linux", "x64").triple).toBe("x86_64-unknown-linux-gnu");
  expect(hostTargetFor("win32", "x64").triple).toBe("x86_64-pc-windows-msvc");
  expect(hostTargetFor("win32", "arm64").triple).toBe("aarch64-pc-windows-msvc");
});

test("a windows host never resolves to a linux triple", () => {
  // The exact regression: ELF-targeting IR emitted under a gnu triple on Windows.
  expect(hostTargetFor("win32", "x64").os).toBe("windows");
  expect(hostTargetFor("win32", "x64").triple).not.toContain("linux");
});

test("unknown hosts are refused explicitly, not mislabelled", () => {
  expect(() => hostTargetFor("freebsd", "x64")).toThrow(UnsupportedHostError);
  expect(() => hostTargetFor("sunos", "x64")).toThrow(/supported: darwin, linux, windows/);
});

test("windows is a named cross-compilation target", () => {
  expect(resolveTarget("windows-x64")?.triple).toBe("x86_64-pc-windows-msvc");
  expect(resolveTarget("windows-arm64")?.triple).toBe("aarch64-pc-windows-msvc");
});

test("the real host resolves on every platform this suite runs on", () => {
  expect(getHostTarget().triple).toBeTruthy();
});

// Cross-compiling to Windows needs the MSVC CRT + Windows SDK, which a POSIX host only
// has if someone ran `xwin splat` and pointed MILO_WINDOWS_SDK at it. Skipped otherwise
// rather than failed: an unset env var means "not set up here", not "broken".
// Setup: cargo install xwin && xwin --accept-license --arch x86_64 splat --output ~/.xwin
// Default to the path the setup line above produces. A dev who ran xwin once should get
// the Windows gate without also having to remember an env var — a skip nobody notices is
// how a codegen change reaches CI's test-windows job untested.
const SDK = process.env.MILO_WINDOWS_SDK
  ?? (existsSync(join(homedir(), ".xwin")) ? join(homedir(), ".xwin") : undefined);
test.skipIf(!SDK || process.platform === "win32")("cross-compiles a windows PE from a posix host", () => {
  const out = join(tmpdir(), `milo_wintest_${process.pid}`);
  const exe = `${out}.exe`;
  try {
    execFileSync("bun", ["run", MAIN, "build", join(ROOT, "examples", "hello.milo"),
      "--target=windows-x64", "-o", out],
      { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, MILO_WINDOWS_SDK: SDK } });
    expect(existsSync(exe)).toBe(true);
    // PE32+ magic: "MZ" DOS header. Proves we emitted COFF, not ELF or Mach-O.
    const head = execFileSync("head", ["-c", "2", exe], { encoding: "latin1" });
    expect(head).toBe("MZ");

    // Linking is not running. A `setvbuf(stdout, NULL, _IOFBF, 0)` emitted into main
    // linked cleanly here and then killed every Windows binary at startup, because MSVC
    // validates that size and routes a 0 to the invalid-parameter handler — caught only
    // by CI's test-windows job, one push later. Wine is not Windows (that job stays the
    // authority), but it runs the real CRT, so it catches a whole class of startup and
    // libc-contract faults on the dev host. Skipped when wine is absent.
    if (hasWine) {
      const r = spawnSync("wine", [exe], { encoding: "utf-8", timeout: 120000, env: { ...process.env, WINEDEBUG: "-all" } });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("Hello, Milo!");
    }
  } finally {
    try { unlinkSync(exe); } catch {}
  }
}, 120000);

// On Windows itself: the full loop, compile AND execute. This is the only place the
// generated code actually runs on the target OS, so it is what proves _write/fprintf
// lowering works rather than merely links.
test.skipIf(process.platform !== "win32")("builds and runs hello.exe natively", () => {
  const out = join(tmpdir(), `milo_wintest_${process.pid}`);
  const exe = `${out}.exe`;
  try {
    execFileSync("bun", ["run", MAIN, "build", join(ROOT, "examples", "hello.milo"), "-o", out],
      { cwd: ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    const stdout = execFileSync(exe, [], { encoding: "utf-8" });
    expect(stdout.trim()).toBe("Hello, Milo!");
  } finally {
    try { unlinkSync(exe); } catch {}
  }
}, 120000);

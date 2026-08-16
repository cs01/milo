// `milo api --markdown` turns std doc-comments into reference markdown, so the
// doc-comments in std are the single source of truth for the .md docs.
import { test, expect } from "bun:test";
import { execSync } from "child_process";
import { join } from "path";

const COMPILER = join(import.meta.dir, "..", "src", "main.ts");
function api(args: string): string {
  return execSync(`bun run ${COMPILER} api ${args}`, { encoding: "utf-8" });
}

test("--markdown emits a signature code block + doc for a documented API", () => {
  const md = api("--module std/runtime --markdown");
  expect(md).toContain("## std/runtime");
  expect(md).toContain("### `Task.spawn`");
  expect(md).toContain("```milo");
  expect(md).toContain("fn Task.spawn(f: move () => void): Task");
  // full doc-comment body, not just the first line
  expect(md).toContain("guard-paged stack");
});

test("undocumented APIs are marked, not silently blank", () => {
  const md = api("--module std/runtime --markdown");
  expect(md).toContain("_Undocumented._");
});

// A leaked `impl` scope printed free functions as `File.splitLines` — a name that
// looks like a real call path but isn't callable. std/io is the regression case:
// its free fns all sit after `impl File`.
test("free fns after an impl block are not impl-prefixed", () => {
  const out = api("--module std/io");
  // readStdin is a free fn declared after `impl File`; it must not gain a File. prefix.
  // (splitLines moved io->fs in the stdlib coherence overhaul, so it's no longer here.)
  expect(out).toContain("fn readStdin(");
  expect(out).not.toContain("File.readStdin");
  // methods genuinely inside `impl File` keep their prefix
  expect(out).toContain("fn File.readAll(");
});

test("default API discovery hides file-private helpers", () => {
  const supported = api("--module std/string");
  expect(supported).toContain("pub fn asciiIsAlpha(");
  expect(supported).not.toContain("fn strContains(");
});

test("@internal keeps cross-file plumbing out of the supported surface", () => {
  const supported = api("--module std/sync");
  expect(supported).not.toContain("channelArmRecv");
});

test("public types and their methods are both discoverable", () => {
  const out = api("--module std/regex");
  expect(out).toContain("pub struct Regex");
  expect(out).toContain("fn Regex.compile(");
  expect(out).not.toContain("regexNew(");
});

test("coherence migrations leave one supported spelling", () => {
  const path = api("--module std/path");
  expect(path).toContain("fn Path.join(");
  expect(path).not.toContain("fn pathJoin(");

  const env = api("--module std/env");
  expect(env).toContain("fn Env.get(");
  expect(env).not.toContain("fn getEnv(");
});

// Gate on `milo api --json` and `milo check --json` — the two machine-readable surfaces
// that let tooling read the compiler without importing its TypeScript.
//
// The point is decoupling: docs generators, package tooling, editors and agents should
// consume a documented payload, not `import { stdDocsByModule } from "../src/api-search"`,
// which only code inside this repo can do — and which pins the whole tooling ecosystem to
// the compiler staying written in TypeScript.
import { test, expect } from "bun:test";
import { execFileSync } from "child_process";
import { join } from "path";
import { API_JSON_SCHEMA, signatureParts, splitParams } from "../src/api-search";

const ROOT = join(import.meta.dir, "..");
const MAIN = join(ROOT, "src", "main.ts");

function milo(args: string[]): { out: string; code: number } {
  try {
    // maxBuffer: the full std dump is ~800 KB, over the default. It is also why
    // src/stdout.ts exists — process.exit() truncates an async pipe write, so this
    // command used to lose its tail and produce invalid JSON only when piped.
    return { out: execFileSync("bun", ["run", MAIN, ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }), code: 0 };
  } catch (e: any) {
    return { out: (e.stdout ?? "") + (e.stderr ?? ""), code: e.status ?? 1 };
  }
}

test("api --json describes a module: signatures, split params, struct fields", () => {
  const doc = JSON.parse(milo(["api", "--module", "std/json", "--json"]).out);
  expect(doc.schema).toBe(API_JSON_SCHEMA);
  expect(doc.entries.length).toBeGreaterThan(20);

  const get = doc.entries.find((e: any) => e.name === "Json.get");
  expect(get.kind).toBe("function");
  expect(get.module).toBe("std/json");
  expect(get.returns).toBe("Option<Json>");
  expect(get.params.map((p: any) => p.name)).toEqual(["self", "key"]);

  // Struct fields are in the payload, so a consumer never re-reads std/*.milo to answer
  // "does this type have that field" — the question docs/site/stdlib/json.md got wrong.
  const json = doc.entries.find((e: any) => e.kind === "type" && e.name === "Json");
  expect(json.fields.map((f: any) => f.name)).toContain("source");
  expect(json.fields.map((f: any) => f.name)).not.toContain("raw");
});

test("api --json with no query covers every module, including platform arms", () => {
  const doc = JSON.parse(milo(["api", "--json"]).out);
  const modules = new Set(doc.entries.map((e: any) => e.module));
  expect(modules.size).toBeGreaterThan(60);
  expect([...modules].some(m => (m as string).includes("platform"))).toBe(true);
});

test("param splitting survives commas inside generics and function types", () => {
  expect(splitParams("m: HashMap<string, i64>, f: (&Request, i64) => Response"))
    .toEqual(["m: HashMap<string, i64>", "f: (&Request, i64) => Response"]);
  // No return type means void — the same thing the checker infers.
  expect(signatureParts("fn f(a: i64)").returns).toBe("void");
});

test("check --json reports a rejection as data, and exits nonzero", () => {
  const bad = join(ROOT, "tests", "errors", "aliasMutContainerElement.milo");
  const res = milo(["check", bad, "--json"]);
  expect(res.code).toBe(1);
  const doc = JSON.parse(res.out);
  expect(doc.ok).toBe(false);
  expect(doc.diagnostics.length).toBeGreaterThan(0);
  const d = doc.diagnostics[0];
  expect(d.severity).toBe("error");
  expect(typeof d.message).toBe("string");
  expect(typeof d.line).toBe("number");
  expect(d.file).toContain("aliasMutContainerElement.milo");
});

test("check --json on a clean file says so, and exits zero", () => {
  const res = milo(["check", join(ROOT, "examples", "hello.milo"), "--json"]);
  expect(res.code).toBe(0);
  const doc = JSON.parse(res.out);
  expect(doc.ok).toBe(true);
  expect(doc.diagnostics.filter((d: any) => d.severity === "error")).toEqual([]);
});

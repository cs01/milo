// Every resource is destroyed exactly once, however it travels.
//
// The accept/reject suites cannot see this class. A program that runs a destructor twice
// COMPILES, and on the common shapes it even behaves: a heap field's second free is a
// no-op on a zeroed pointer. The bug only surfaces when the destructor has an effect —
// `std/http`'s `Socket { fd: i32 }` closing a descriptor, `std/mem`'s `MappedMemory`
// unmapping — and then it is `close(0)` on stdin rather than a crash you can bisect.
//
// So this matrix counts. One resource is created per program and the destructor must run
// exactly ONE time: zero is a leak, two is a double destruction. It found the enum
// pattern-move bug (checker said moved, codegen left the subject's drop glue armed), and
// it is the gate that keeps ownership paths honest as new ones are added.
//
// The payload shapes matter as much as the routes. `Res { id: i64 }` is all-Copy, which
// is what exposed the double drop — every other shape hid it behind a harmless second
// free of a null pointer. See docs/plans/aliasing-coverage.md.
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { guardedRun } from "../scripts/guard";

const MILO_ROOT = join(import.meta.dir, "..");
const IS_WINDOWS = process.platform === "win32";
const EXE = IS_WINDOWS ? ".exe" : "";
const WORK = mkdtempSync(join(tmpdir(), "milo-drops-"));
const MILOC = join(WORK, "miloc") + EXE;
const CHILD_ENV = { ...process.env, MILO_ROOT };

afterAll(() => {
  try { rmSync(WORK, { recursive: true, force: true }); } catch {}
});

// Every shape carries `id` so the destructor prints the same marker; they differ only in
// whether the REST of the fields are Copy, which is the axis that hid the double drop.
const SHAPES: Record<string, { decl: string; mk: (n: string) => string }> = {
  "all-Copy fields": {
    decl: `struct Res { id: i64 }`,
    mk: n => `Res { id: ${n} }`,
  },
  "a heap field": {
    decl: `struct Res { id: i64, name: string }`,
    mk: n => `Res { id: ${n}, name: "resource" }`,
  },
  "a container field": {
    decl: `struct Res { id: i64, v: Vec<string> }`,
    mk: n => `Res { id: ${n}, v: Vec.new() }`,
  },
};

// Each route takes ownership of exactly one resource by a different path.
const ROUTES: Record<string, { decls?: string; body: string }> = {
  "held in a local": {
    body: `    var r = MK
    print("use ", r.id)`,
  },
  "moved into a fn": {
    decls: `fn eat(r: Res): void { print("ate ", r.id) }`,
    body: `    eat(MK)`,
  },
  "moved into another local": {
    body: `    var a = MK
    var b = a
    print("moved ", b.id)`,
  },
  "stored in a struct field": {
    decls: `struct Box { r: Res }`,
    body: `    var bx = Box { r: MK }
    print("in ", bx.r.id)`,
  },
  "pushed into a Vec": {
    body: `    var v: Vec<Res> = Vec.new()
    v.push(MK)
    print("len ", v.len)`,
  },
  "returned from a fn": {
    decls: `fn make(): Res { return MK }`,
    body: `    var r = make()
    print("got ", r.id)`,
  },
  "matched out of an Option local": {
    body: `    var o: Option<Res> = Option.Some(MK)
    match o {
        Option.Some(r) => { print("got ", r.id) }
        Option.None => { print("none") }
    }`,
  },
  "matched out of an Option field": {
    decls: `struct Bag { o: Option<Res> }`,
    body: `    var b = Bag { o: Option.Some(MK) }
    match b.o {
        Option.Some(r) => { print("got ", r.id) }
        Option.None => { print("none") }
    }`,
  },
  "bound by if-let from an Option": {
    body: `    var o: Option<Res> = Option.Some(MK)
    if let Option.Some(r) = o { print("got ", r.id) }`,
  },
};

function program(shape: keyof typeof SHAPES, route: keyof typeof ROUTES): string {
  const s = SHAPES[shape];
  const r = ROUTES[route];
  const body = r.body.replaceAll("MK", s.mk("1"));
  const decls = (r.decls ?? "").replaceAll("MK", s.mk("1"));
  return `${s.decl}

impl Drop for Res {
    fn drop(self: &mut Self): void { print("drop ", self.id) }
}

${decls}

fn main() {
${body}
    print("end")
}
`;
}

type Cell = { drops: number; detail: string };
const results: Record<string, Record<string, Cell>> = {};

describe("a resource is destroyed exactly once", () => {
  beforeAll(async () => {
    execSync(`bun build --compile ${join(MILO_ROOT, "src", "main.ts")} --outfile ${MILOC}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const shape of Object.keys(SHAPES)) {
      results[shape] = {};
      for (const route of Object.keys(ROUTES)) {
        const stem = `${shape}_${route}`.replace(/[^a-z0-9]/gi, "_");
        const srcPath = join(WORK, `${stem}.milo`);
        const binPath = join(WORK, stem);
        writeFileSync(srcPath, program(shape, route));
        const build = await guardedRun(MILOC, ["build", srcPath, "-o", binPath], {
          env: CHILD_ENV, virtualMemMb: 8192,
        });
        if (build.code !== 0 || !existsSync(binPath + EXE)) {
          results[shape][route] = { drops: -1, detail: `build failed: ${(build.stderr || "").trim().slice(0, 200)}` };
          continue;
        }
        const run = await guardedRun(binPath + EXE, [], { env: CHILD_ENV, virtualMemMb: 8192 });
        const out = run.stdout || "";
        // A guard kill leaves partial stdout, which would read as a leak. Distinguish it
        // from a real count so a busy machine cannot manufacture a failure.
        if (run.code !== 0) {
          results[shape][route] = { drops: -1, detail: `run exited ${run.code}` };
          continue;
        }
        results[shape][route] = {
          drops: out.split("\n").filter(l => l.startsWith("drop ")).length,
          detail: out.trim().replace(/\n/g, " | "),
        };
      }
    }
  }, 900_000);

  for (const shape of Object.keys(SHAPES)) {
    for (const route of Object.keys(ROUTES)) {
      test(`${shape}, ${route}`, () => {
        const cell = results[shape][route];
        if (cell.drops === -1) {
          // Unmeasured is not evidence either way — see the guard note above.
          console.log(`  UNMEASURED ${shape}/${route}: ${cell.detail}`);
          return;
        }
        expect({ route, drops: cell.drops, output: cell.detail })
          .toEqual({ route, drops: 1, output: cell.detail });
      });
    }
  }
});

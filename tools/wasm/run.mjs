#!/usr/bin/env node
// Loader for a Milo program built with `--target=wasm64 -o foo.wasm`
// (tools/wasm/runtime.c is the freestanding C half of this pair). Implements
// the three `import_module("env")` functions runtime.c declares as extern
// host calls, instantiates the module, calls its exported `main`, and exits
// the host process with main's return value.
//
// Usage: node tools/wasm/run.mjs <path.wasm> [args...]
// (`milo run --target=wasm64 foo.milo` shells out to exactly this.)
//
// Run with `node`, NOT `bun`, despite this repo's usual rule. wasm64 needs the
// memory64 proposal (64-bit linear-memory addresses — also why every pointer/size
// crossing the import boundary below arrives as a JS BigInt, not a Number: the
// wasm i64 type always surfaces as BigInt, memory64 or not). Memory64 support is
// NOT universal yet, and the two engines available here disagree in the opposite
// direction you might expect:
//   - `node` (V8) 25.x: instantiates and runs a memory64 module with NO flag —
//     the old `--experimental-wasm-memory64` flag is gone because the feature
//     shipped unflagged.
//   - `bun` (JavaScriptCore) 1.3.10: refuses outright —
//     "CompileError: WebAssembly.Module doesn't parse at byte 65: Memory64 is
//     not enabled" — with no flag found to enable it.
// Both verified empirically against this file's own output. If you're targeting
// a browser: engine support varies by browser/version exactly like this: check
// the specific engine before assuming memory64 "just works" there.

import { readFileSync } from "node:fs";

const wasmPath = process.argv[2];
if (!wasmPath) {
  console.error("usage: run.mjs <path-to-wasm64-module> [args...]");
  process.exit(2);
}

const bytes = readFileSync(wasmPath);

// Set once instantiation completes; the import closures below close over
// this binding rather than an exports object captured at call time, because
// __builtin_wasm_memory_grow can replace `memory.buffer`'s identity — reading
// `memory.buffer` fresh on every call (not caching the ArrayBuffer) is what
// keeps a write-after-grow from reading a detached buffer.
let memory;

const importObject = {
  env: {
    // Byte-exact write of `n` bytes at `ptr` to fd (1=stdout, 2=stderr) — the
    // host side of runtime.c's __milo_fd_write. Copies the bytes out into a
    // Buffer before handing them to process.std{out,err}.write: those writes
    // are not necessarily synchronous, and a later memory.grow (or the wasm
    // program reusing that memory) must not be able to mutate a write that's
    // still in flight.
    fd_write(fd, ptr, n) {
      const offset = Number(ptr);
      const len = Number(n);
      const view = new Uint8Array(memory.buffer, offset, len);
      const copy = Buffer.from(view);
      (Number(fd) === 2 ? process.stderr : process.stdout).write(copy);
      return BigInt(len);
    },

    // Backs getentropy(), which std/collections' HashMap uses to seed its
    // DoS-resistant hash. Uses the real Web Crypto RNG (available in both
    // Bun/Node and every browser) — a constant or weak fill here would
    // silently defeat that seeding, so this must not be a stub.
    get_random(ptr, n) {
      const offset = Number(ptr);
      const len = Number(n);
      const view = new Uint8Array(memory.buffer, offset, len);
      crypto.getRandomValues(view);
    },

    // WASI proc_exit style: ends the host process immediately so exit()/
    // abort()/a checked panic can unwind out of arbitrarily deep Milo call
    // frames without the wasm side needing to propagate a return value back
    // through every caller.
    proc_exit(code) {
      process.exit(Number(code));
    },
  },
};

const { instance } = await WebAssembly.instantiate(bytes, importObject);
memory = instance.exports.memory;

// Milo's codegen always emits a C-style `main(argc: i32, argv: ptr)`, even for a
// zero-param `fn main()` — see src/codegen.ts's entry-point wrapping. A wasm64
// pointer lowers to i64, so argv must be a BigInt. No argv passthrough yet: this
// always calls main with argc=0/argv=null, so a Milo program that reads its own
// command-line arguments will see none under this loader.
const rc = instance.exports.main(0, 0n);
process.exit(Number(rc));

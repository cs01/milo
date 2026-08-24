// `Shared` no longer mirrors `Sealed`'s reader set: it reached its buffer as
// `(*box).inner`, which is not a `Self`, so every reader had to be re-typed by hand, and
// the two hand-kept lists were what this gate used to police. `sharedWith` replaced them
// with one borrow point, so the mirror invariant is gone by design.
//
// Two narrower invariants took its place, and both are things a plausible edit breaks:
//
//   1. The few readers `Shared` still carries directly (the per-byte hot path) must mean
//      the same thing as the `Sealed` method of that name. Two spellings that agree is a
//      convenience; two spellings that disagree is the silent-wrong-answer failure this
//      module exists to abolish.
//   2. The module-private `sealed*` free functions must stay private. They exist only in
//      the by-value-receiver form `impl Shared` needs; a `pub` twin of a method is the
//      permanent alias layer docs/stdlib-design.md rules out.
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(join(import.meta.dir, "..", "std", "seal.milo"), "utf8");

// name -> the signature text after the receiver, e.g. ", i: i64): u8".
function methodsOf(ty: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(`\\nimpl ${ty} \\{\\n([\\s\\S]*?)\\n\\}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(SRC)) !== null) {
    for (const f of m[1].matchAll(/\n    fn (\w+)\(self: &?m?u?t?\s?Self(.*)\{/g)) {
      out.set(f[1], f[2].trim());
    }
  }
  return out;
}

// Verbs about ownership or holder count, not about reading the bytes.
const OWNERSHIP_ONLY = new Set(["clone", "holders", "share", "unseal"]);

test("every reader Shared still carries directly has the same signature on Sealed", () => {
  const sealed = methodsOf("Sealed");
  const shared = methodsOf("Shared");
  // If the regexes stop matching, everything below passes vacuously.
  expect(sealed.size).toBeGreaterThan(4);
  expect(shared.size).toBeGreaterThan(1);

  const sharedReaders = [...shared.keys()].filter(m => !OWNERSHIP_ONLY.has(m));
  expect(sharedReaders.length).toBeGreaterThan(0);

  for (const name of sharedReaders) {
    expect(sealed.has(name)).toBe(true);
    expect(`Shared.${name}${shared.get(name)}`).toEqual(`Shared.${name}${sealed.get(name)}`);
  }
});

test("the wide reader API is reached through sharedWith, not copied onto Shared", () => {
  expect(SRC).toContain("pub fn sharedWith<R>(sh: &Shared, f: (&Sealed) => R): R");

  // These were the hand-copied duplicates. A future edit that re-adds one to Shared
  // rebuilds the drift this gate was originally written to catch.
  const shared = methodsOf("Shared");
  for (const gone of ["span", "spanOf", "holds", "text", "eq", "each"]) {
    expect(shared.has(gone)).toBe(false);
  }
});

test("the sealed* readers stay module-private", () => {
  const names = ["sealedLen", "sealedSpan", "sealedSpanOf", "sealedHolds",
                 "sealedByteAt", "sealedText", "sealedEq", "sealedEach"];
  for (const n of names) {
    expect(SRC).toContain(`\nfn ${n}(`);
    expect(SRC).not.toContain(`pub fn ${n}(`);
  }
});

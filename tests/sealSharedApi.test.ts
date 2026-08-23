// `Shared` is `Sealed` with holders. That claim is what makes the module cheap to
// learn: the reader learns ONE set of reader methods and uses it on either type.
//
// Nothing enforces it, though. Milo cannot return a `&Sealed`, so `Shared` cannot
// delegate through a deref the way `Arc<T>` does in Rust — every reader is
// re-exposed by hand, and a reader added to one type and not the other silently
// breaks the property the docs promise. This gate is the enforcement.
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(join(import.meta.dir, "..", "std", "seal.milo"), "utf8");

function methodsOf(ty: string): Set<string> {
  // Every `impl <ty> {` block in the file, since a type may have more than one.
  const out = new Set<string>();
  const re = new RegExp(`\\nimpl ${ty} \\{\\n([\\s\\S]*?)\\n\\}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(SRC)) !== null) {
    for (const f of m[1].matchAll(/\n    fn (\w+)/g)) out.add(f[1]);
  }
  return out;
}

// Verbs that are about ownership, not reading, so they are legitimately not shared.
const OWNERSHIP_ONLY = { Sealed: new Set(["unseal", "share"]), Shared: new Set(["clone", "holders"]) };

test("Sealed and Shared expose the same reader API", () => {
  const sealed = methodsOf("Sealed");
  const shared = methodsOf("Shared");
  expect(sealed.size).toBeGreaterThan(4); // the regex still matches something

  const sealedReaders = [...sealed].filter(m => !OWNERSHIP_ONLY.Sealed.has(m)).sort();
  const sharedReaders = [...shared].filter(m => !OWNERSHIP_ONLY.Shared.has(m)).sort();

  expect(sharedReaders).toEqual(sealedReaders);
});

test("the ownership verbs are where the two types differ, and only there", () => {
  const sealed = methodsOf("Sealed");
  const shared = methodsOf("Shared");
  expect([...sealed].filter(m => !shared.has(m)).sort()).toEqual([...OWNERSHIP_ONLY.Sealed].sort());
  expect([...shared].filter(m => !sealed.has(m)).sort()).toEqual([...OWNERSHIP_ONLY.Shared].sort());
});

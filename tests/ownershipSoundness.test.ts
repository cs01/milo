// Soundness check for the ownership checker, run as part of `bun test` (and thus CI).
//
// The fixtures next door ask "does this specific mistake get caught". This asks the
// question no fixture can: of all the ways a move can be SPELLED, is there one the
// checker walks past? Every ownership hole this compiler has had was that shape — the
// rule was right and one spelling of the operation never reached it (a fork tail, a
// struct field, a method argument). A fixture only covers a spelling someone thought of.
//
// Half the generated programs are correct and half have a use-after-move spliced in,
// so both directions are pinned: a checker that accepts everything fails on the second
// half, and one that rejects everything fails on the first. Accepted programs are then
// executed against a stdout the generator predicted, which is what turns "the checker
// missed a move" into "and here is the wrong value it produced".
//
// The seed is fixed so a failure here is reproducible verbatim:
//   bun scripts/fuzz-ownership.ts --cases 40 --seed 4 --keep --verbose
import { test, expect } from "bun:test";
import { execSync } from "child_process";
import { join } from "path";

test("no false accepts: an accepted program owns what it prints", () => {
  let out = "";
  let failed = false;
  try {
    out = execSync(`bun ${join(import.meta.dir, "..", "scripts", "fuzz-ownership.ts")} --cases 40 --seed 4`, {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    failed = true;
  }
  console.log(out);

  // A run where nothing compiled tests nothing about over-acceptance. The fuzzer exits 2
  // and says VACUOUS, but assert the counters here too: a soundness test that quietly
  // stops exercising the thing it guards is worse than not having one.
  const valid = out.match(/valid programs accepted:\s+(\d+)\/(\d+)/);
  const invalid = out.match(/invalid programs rejected:\s+(\d+)\/(\d+)/);
  expect(valid).not.toBeNull();
  expect(invalid).not.toBeNull();
  expect(Number(valid![1])).toBeGreaterThan(0);
  expect(Number(invalid![2])).toBeGreaterThan(0);

  expect(failed ? out : "").toBe("");
}, 600000);

// Soundness check for `milo prove`, run as part of `bun test` (and thus CI).
//
// The contract gate next door asks "does any contract fail to hold". This asks the more
// fundamental question: when the prover says PROVEN, is it telling the truth? That is the
// only verdict that can be wrong in a dangerous direction — `unknown` and `failed` cost
// you precision and patience, a false `proven` costs you the guarantee itself.
//
// The generator fits a postcondition to two sampled inputs, then executes the program over
// twenty-six. A clause true only on the sample is false in general, so a `proven` verdict
// on one is a false proof by construction and the wide run exhibits the counterexample.
// See scripts/prove-soundness-fuzz.ts for the shapes and the reasoning behind them.
//
// The seed is fixed so a failure here is reproducible verbatim:
//   bun scripts/prove-soundness-fuzz.ts --cases 40 --seed 7 --keep
import { test, expect } from "bun:test";
import { execSync } from "child_process";
import { join } from "path";

test("no false proofs: a `proven` contract survives execution", () => {
  let out = "";
  let failed = false;
  try {
    out = execSync(`bun ${join(import.meta.dir, "..", "scripts", "prove-soundness-fuzz.ts")} --cases 40 --seed 7`, {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: any) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    failed = true;
  }
  console.log(out);

  // A run where nothing was proven proves nothing about proofs. The fuzzer exits 2 and
  // says so, but assert it here too — a silently vacuous soundness test is exactly the
  // kind of false confidence this file exists to prevent.
  const controls = out.match(/controls proven: (\d+)\/(\d+)/);
  expect(controls).not.toBeNull();
  expect(Number(controls![1])).toBeGreaterThan(0);

  expect(failed ? out : "").toBe("");
}, 900000);

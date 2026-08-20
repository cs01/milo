// A fixture with a `Drop` impl always diverges between the native backend and emit-js,
// because `src/codegen-js.ts` implements no destructors at all — it contains zero
// references to Drop. So every such fixture must be recorded as a known mismatch in the
// parity baseline.
//
// This exists because the rule is invisible until it bites. Adding a Drop fixture looks
// entirely local; the failure arrives ~4 minutes into a CI run, in a different file, as
// "agree -> mismatch". That happened twice in one day. Checking the invariant directly
// turns a slow remote failure into an instant local one, and — more usefully — states the
// backend gap out loud instead of leaving it implied by a JSON entry.
//
// If emit-js ever grows destructors, this test is the thing that should fail, and the fix
// is to re-run the sweep rather than to edit the baseline by hand.
import { test, expect } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const FIXTURES = join(ROOT, "tests", "fixtures");
const BASELINE = join(ROOT, "tests", "emitJsParity.baseline.json");

test("every fixture with a Drop impl is recorded as an emit-js mismatch", () => {
  const base: Record<string, string> = JSON.parse(readFileSync(BASELINE, "utf8"));
  const withDrop = readdirSync(FIXTURES)
    .filter(f => f.endsWith(".milo"))
    .filter(f => /impl\s+Drop\s+for\b/.test(readFileSync(join(FIXTURES, f), "utf8")));

  // The whole test is a filter over a filter, so if `impl\s+Drop\s+for` stops matching —
  // a spelling change, a fixture rename, `Drop` becoming a derive — withDrop goes empty
  // and this passes having checked nothing. Floor under today's 14.
  expect(withDrop.length, "no fixture matched the Drop-impl pattern — this gate is checking nothing").toBeGreaterThan(8);

  // Not "is it present" — a fixture recorded as `agree` is the exact failure this
  // catches, and an absent one is read as `agree` by the sweep.
  const wrong = withDrop.filter(f => base[f] !== "mismatch")
    .map(f => `${f}: ${base[f] ?? "absent (reads as 'agree')"}`);

  expect({ wrong, hint: wrong.length ? "emit-js runs no destructors; record these as \"mismatch\" in tests/emitJsParity.baseline.json" : "" })
    .toEqual({ wrong: [], hint: "" });
});

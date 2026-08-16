// Gate on docs/breaking-changes.md: every public std name that vanished or changed
// shape since the last release tag must be written up there.
//
// std is one flat namespace, so a compat shim for a moved name is impossible and this
// doc is the only migration users get (AGENTS.md). Writing the entry was a habit
// nothing enforced — five `std/fetch` functions changed their return type, `std/toml`
// left for a package, and two `std/pty` helpers went private, all unmentioned.
//
// The prose cannot be generated. The DETECTION can, and that is what this checks; it
// cannot tell whether the migration text is any good, only that the name appears.
import { test, expect } from "bun:test";
import { breaksSince, undocumented, lastReleaseTag } from "../scripts/check-breaking";

test("there is a release tag to compare against", () => {
  expect(lastReleaseTag()).toMatch(/^v\d/);
});

test("every public std break since the last release is documented", () => {
  const breaks = breaksSince(lastReleaseTag());
  // A comparison that found no breaks at all would pass for free — since v0.1.0 there
  // are dozens, so a zero here means the surface scan or the git read stopped working.
  expect(breaks.length).toBeGreaterThan(0);
  const missing = undocumented(breaks).map(b => `${b.kind} ${b.name}`);
  expect(missing).toEqual([]);
}, 120000);

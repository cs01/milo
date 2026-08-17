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
import { breaksSince, undocumented, lastReleaseTag, surfaceAt } from "../scripts/check-breaking";

test("there is a release tag to compare against", () => {
  expect(lastReleaseTag()).toMatch(/^v\d/);
});

// The control this gate needs, stated against the SCAN rather than the result.
//
// It used to assert `breaks.length > 0`, reasoning that a comparison finding nothing
// would pass for free. True, but it made a fresh release fail: the moment a tag is cut,
// `lastReleaseTag()` is HEAD, there are legitimately zero breaks since it, and the gate
// went red for having nothing to report. Cutting a release should not be the thing that
// breaks CI. What actually needs proving is that the git read and the surface scan still
// work, and reading a non-empty std surface at the base tag proves exactly that.
test("the surface scan can still read std at the last release tag", () => {
  const before = surfaceAt(lastReleaseTag());
  expect(Object.keys(before).length).toBeGreaterThan(100);
}, 120000);

test("every public std break since the last release is documented", () => {
  const breaks = breaksSince(lastReleaseTag());
  const missing = undocumented(breaks).map(b => `${b.kind} ${b.name}`);
  expect(missing).toEqual([]);
}, 120000);

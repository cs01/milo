// Fixture annotation parsing, shared by tests/run.test.ts (TS compiler) and
// tests/selfhost.test.ts (milo-self). Both must agree on what a fixture expects,
// otherwise the self-host ratchet measures the wrong thing.
//
// Annotations are matched after trimming: the formatter indents comments to
// their enclosing block, so requiring column 0 would make `milo fmt` break
// every fixture whose annotation sits inside a function body.

export function parseExpected(source: string): string[] {
  return source.split("\n")
    .map(l => l.trim())
    .filter(l => l.startsWith("// @expect:"))
    .map(l => l.replace("// @expect:", "").trim());
}

// The annotation may lead its own line or trail the offending statement — ten fixtures
// use the trailing form because it points at the line that must fail, and a parser that
// only matched the leading form found nothing in them. run.test.ts then skipped the
// message assertion entirely, leaving "the compiler rejected this for SOME reason" as
// the whole test.
export function parseExpectedError(source: string): string | null {
  for (const line of source.split("\n")) {
    const m = /\/\/\s*@error:\s*(.+)$/.exec(line);
    if (m) return m[1]!.trim();
  }
  return null;
}

export function parseExpectedRuntimeError(source: string): string | null {
  const line = source.split("\n").map(l => l.trim()).find(l => l.startsWith("// @runtime-error:"));
  return line ? line.replace("// @runtime-error:", "").trim() : null;
}

// The warning names `--deny=` / `--allow=` accept, and which of them are off by default.
//
// The list existed twice — as string literals at each `this.warn("name", …)` call site in
// checker.ts, and as prose inside the `--deny-all` help text — and nothing compared them.
// A user typing `--deny=unused-varibale` got silence, and a warning added to the checker
// never reached the help. tests/warnings.test.ts holds this file to the call sites in both
// directions, and cli-help.ts renders the help line from it.
export interface WarningInfo {
  name: string;
  /** Off by default: not reported unless `--deny=<name>` (or `--deny-all`) asks for it. */
  offByDefault?: true;
}

export const WARNINGS: WarningInfo[] = [
  { name: "bare-embedfile" },
  { name: "bare-targetos" },
  { name: "index-clone", offByDefault: true },
  { name: "large-stack-array", offByDefault: true },
  { name: "missing-interpolation" },
  { name: "nan-comparison" },
  { name: "shadows-stdlib-override" },
  { name: "unused-import", offByDefault: true },
  { name: "unused-move", offByDefault: true },
  { name: "unused-result" },
  { name: "unused-unsafe" },
  { name: "unused-variable" },
  { name: "unverified-extern", offByDefault: true },
];

export const WARNING_NAMES: string[] = WARNINGS.map(w => w.name);
export const OFF_BY_DEFAULT: string[] = WARNINGS.filter(w => w.offByDefault).map(w => w.name);

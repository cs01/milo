// Regenerates editors/vscode/syntaxes/milo.tmLanguage.json from the compiler's own
// keyword and primitive-type lists.
//
// Run:  bun run scripts/gen-tmlanguage.ts          # rewrite the grammar
//       bun run scripts/gen-tmlanguage.ts --check  # fail if it is stale (CI/test)
//
// The grammar was hand-maintained and had drifted: it highlighted `parallel` and
// `char`, which are not in the language at all, and did not highlight `trait`,
// `type`, `move`, `from`, `thread_local`, or the `string`/`int`/`byte`/`float` type
// names. Which SCOPE a keyword belongs to is editorial and stays hand-written below;
// what cannot drift is the membership — SCOPES must partition KEYWORDS ∪ SOFT_KEYWORDS
// exactly, and assignPartition throws if it does not.
import { readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";

// Read the vocabulary through `milo lang --json`, not by importing src/tokens.ts. An
// editor grammar is the canonical out-of-repo consumer — tree-sitter, Zed, Neovim and the
// docs site all need exactly this list and none of them can import TypeScript — so this
// generator uses the same door they do, which is the only way the door stays working.
const lang = JSON.parse(execFileSync(
  "bun", ["run", join(import.meta.dir, "..", "src", "main.ts"), "lang", "--json"],
  { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
));
const KEYWORDS: string[] = lang.keywords;
const SOFT_KEYWORDS: string[] = lang.softKeywords;
const PRIMITIVE_TYPE_NAMES: string[] = lang.primitiveTypes;

const OUT = join(import.meta.dir, "..", "editors", "vscode", "syntaxes", "milo.tmLanguage.json");

// TextMate scope → the keywords that belong to it. Editorial: a scope choice decides
// what colour a theme paints the word, and no rule in the compiler implies it.
const SCOPES: { scope: string; words: string[] }[] = [
  { scope: "keyword.control.milo", words: ["if", "else", "while", "for", "in", "match", "return", "break", "continue", "unsafe"] },
  { scope: "keyword.control.import.milo", words: ["import", "from"] },
  { scope: "keyword.other.contract.milo", words: ["requires", "ensures", "invariant", "decreases"] },
  { scope: "storage.type.fn.milo", words: ["fn"] },
  { scope: "storage.modifier.milo", words: ["let", "var", "mut", "move", "extern", "pub", "impl", "thread_local"] },
  { scope: "keyword.declaration.milo", words: ["struct", "enum", "interface", "trait", "type", "derive"] },
  { scope: "keyword.operator.cast.milo", words: ["as", "is"] },
  // Painted as constants rather than keywords — a theme colours a literal, not a verb.
  { scope: "constant.language.milo", words: ["true", "false", "null"] },
];

// Builtin container types and enum variants. Unlike everything above, this list is
// NOT derivable: an unknown name in type position is accepted as a struct name and
// only fails later at use, so there is no check that answers "is this a real type".
// It is curated by hand and lives here so the whole grammar has one source. It used
// to claim `String`, which is not a Milo type at all — strings are `string`, and
// `let s: String = "hi"` is a type mismatch.
const BUILTIN_TYPE_WORDS = ["Heap", "Vec", "HashMap", "Option", "Result", "Some", "None", "Ok", "Err"];

function assignPartition(): void {
  const all = new Set<string>([...KEYWORDS, ...SOFT_KEYWORDS]);
  const seen = new Set<string>();
  for (const { scope, words } of SCOPES) {
    for (const w of words) {
      if (!all.has(w)) throw new Error(`${scope} highlights '${w}', which is not a keyword — remove it or add it to tokens.ts`);
      if (seen.has(w)) throw new Error(`'${w}' is assigned to more than one scope`);
      seen.add(w);
    }
  }
  const unassigned = [...all].filter(w => !seen.has(w)).sort();
  if (unassigned.length) throw new Error(`keyword(s) with no scope, so the editor will not highlight them: ${unassigned.join(", ")}`);
}

const alt = (words: readonly string[]) => `\\b(${[...words].join("|")})\\b`;

function grammar(): string {
  assignPartition();
  const keywordPatterns = SCOPES
    .filter(s => !s.scope.startsWith("constant."))
    .map(s => ({ name: s.scope, match: alt(s.words) }));
  const constantPatterns = SCOPES
    .filter(s => s.scope.startsWith("constant."))
    .map(s => ({ name: s.scope, match: alt(s.words) }));

  const g = JSON.parse(readFileSync(OUT, "utf-8"));
  g.repository.keywords.patterns = keywordPatterns;
  // Only the generated rules are replaced; the literal/comment/operator rules in the
  // file are hand-written regexes with no compiler-side source to derive them from.
  const consts = g.repository.constants.patterns as { name: string; match: string }[];
  for (const c of constantPatterns) {
    const i = consts.findIndex(p => p.name === c.name);
    if (i < 0) throw new Error(`no '${c.name}' rule to replace in the constants repository`);
    consts[i] = c;
  }
  const types = g.repository.types.patterns as { name: string; match: string }[];
  for (const [name, words] of [
    ["support.type.primitive.milo", PRIMITIVE_TYPE_NAMES],
    ["support.type.builtin.milo", BUILTIN_TYPE_WORDS],
  ] as const) {
    const ti = types.findIndex(p => p.name === name);
    if (ti < 0) throw new Error(`no '${name}' rule to replace in the types repository`);
    types[ti] = { name, match: alt(words) };
  }

  return JSON.stringify(g, null, 2) + "\n";
}

const next = grammar();
if (process.argv.includes("--check")) {
  if (readFileSync(OUT, "utf-8") !== next) {
    console.error("milo.tmLanguage.json is stale — run: bun run scripts/gen-tmlanguage.ts");
    process.exit(1);
  }
  console.log("milo.tmLanguage.json is up to date");
} else {
  writeFileSync(OUT, next);
  console.log(`wrote ${OUT}`);
}

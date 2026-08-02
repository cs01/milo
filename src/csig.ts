// Parsing for the C signature text in `@cSig("<header>", "<signature>")`.
//
// The signature is author-written prose that both the checker and codegen have to agree
// about: the checker compares its arity against the Milo declaration, and codegen turns
// each parameter into a `_Static_assert` about that parameter's width. Splitting it in two
// places would let the two drift and compare parameter i against parameter i+1.
//
// This is deliberately not a C parser. It handles prototype parameter lists — the form a
// header declares — and gives up (returns null) on anything with nested parens, which is a
// function-pointer parameter and has no width worth asserting.

// C keywords that can legally be the last token of a type. Anything else in final position
// is a parameter name: `int fd` names one, `unsigned int` does not, and a lone `size_t` can
// only be the type, since a prototype parameter may omit its name but never its type.
const C_TYPE_TAIL = new Set([
  "void", "char", "short", "int", "long", "float", "double", "signed", "unsigned",
  "_Bool", "const", "volatile", "struct", "union", "enum", "restrict", "__restrict",
]);

function stripCParamName(param: string): string {
  // An array parameter IS a pointer parameter — C adjusts `double []` to `double *` and
  // `char buf[16]` to `char *`. Spelled as written it is an incomplete type that `sizeof`
  // rejects, so the guard would report "no such type" instead of the width it meant to ask
  // about. Drop the extent, drop the name, then put the star back.
  const arr = param.match(/^(.*?)\s*\[[^\]]*\]\s*$/);
  if (arr) return `${stripCParamName(arr[1]!)} *`;
  // Detach `*` from whatever it abuts so `char *buf` tokenises as three tokens, not two.
  const parts = param.replace(/\*/g, " * ").trim().split(/\s+/).filter(p => p !== "");
  if (parts.length < 2) return parts.join(" ");
  const last = parts[parts.length - 1]!;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) return parts.join(" ");
  if (C_TYPE_TAIL.has(last)) return parts.join(" ");
  return parts.slice(0, -1).join(" ");
}

// The C parameter list, one type per entry with any parameter name stripped, or null when
// a parameter is a function pointer (nested parens make splitting on commas wrong).
// `(void)` is zero parameters, not one. A trailing `...` is kept as its own entry.
export function cSigParams(sig: string): string[] | null {
  const open = sig.indexOf("(");
  if (open < 0) return null;
  const inner = sig.slice(open + 1, sig.lastIndexOf(")")).trim();
  if (inner === "" || inner === "void") return [];
  if (inner.includes("(")) return null;
  return inner.split(",").map(stripCParamName);
}

// A header spec as a diagnostic reads it. The '|' alternates and '+' feature macros are
// instructions to the preprocessor, not something a reader should have to decode mid-error.
export function headerLabel(spec: string): string {
  return spec.split("|").map(alt => alt.split("+").pop()!).join(" or ");
}

// Parameter count excluding a trailing `...`, or null when the list can't be split.
export function countCSigParams(sig: string): number | null {
  const params = cSigParams(sig);
  if (params === null) return null;
  return params.filter(p => p !== "...").length;
}

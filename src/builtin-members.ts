// The builtin method surface, for the receivers whose dispatch is a hand-written
// if-chain in checker.ts rather than a symbol table.
//
// This file is the only place that list lives. It previously existed three times —
// the checker's dispatch, suggest.ts's did-you-mean names, and lsp.ts's completion
// signatures — and they drifted: twelve methods the checker accepted were missing
// from completion, and all sixteen integer arithmetic builtins were missing from
// both. A member here is not automatically implemented; tests/builtinMembers.test.ts
// compiles a probe per row so a lie in this table fails the build, and greps the
// dispatch so a method added there without a row here fails too.
//
// `sig` is what the LSP shows after the name. `note` is a caveat appended to it —
// use it for the rules a signature can't express (Copy-only, for-in only, consumes
// the receiver).

export interface BuiltinMember {
  name: string;
  sig: string;
  note?: string;
}

export type BuiltinReceiver =
  | "string" | "vec" | "hashmap" | "option" | "result"
  | "int" | "float" | "bool" | "any";

export const BUILTIN_MEMBERS: Record<BuiltinReceiver, BuiltinMember[]> = {
  // Callable on any receiver at all, so they belong to no single table.
  any: [
    { name: "addrOf", sig: "(): *T", note: "raw address of an lvalue; requires 'unsafe'" },
  ],

  string: [
    { name: "len", sig: ": i64" },
    { name: "isEmpty", sig: "(): bool" },
    { name: "contains", sig: "(needle: string): bool" },
    { name: "startsWith", sig: "(prefix: string): bool" },
    { name: "endsWith", sig: "(suffix: string): bool" },
    { name: "indexOf", sig: "(needle: string): Option<i64>" },
    { name: "indexOfFrom", sig: "(needle: string, from: i64): Option<i64>" },
    { name: "lastIndexOf", sig: "(needle: string): Option<i64>" },
    { name: "charAt", sig: "(i: i64): string" },
    { name: "substr", sig: "(start: i64, end: i64): string" },
    { name: "slice", sig: "(start: i64, end: i64): &string", note: "a view, not a copy — the receiver is frozen while it lives" },
    { name: "toLower", sig: "(): string" },
    { name: "toUpper", sig: "(): string" },
    { name: "trim", sig: "(): string" },
    { name: "trimStart", sig: "(): string" },
    { name: "trimEnd", sig: "(): string" },
    { name: "repeat", sig: "(n: i64): string" },
    { name: "reverse", sig: "(): string" },
    { name: "padStart", sig: "(targetLen: i64, pad: string): string" },
    { name: "padEnd", sig: "(targetLen: i64, pad: string): string" },
    { name: "replace", sig: "(old: string, new: string): string" },
    { name: "replaceFirst", sig: "(old: string, new: string): string" },
    { name: "split", sig: "(sep: string): Vec<string>" },
    { name: "splitWords", sig: "(): Vec<string>" },
    { name: "splitWhitespace", sig: "(): Vec<string>" },
    { name: "lines", sig: "(): &string pieces", note: "for-in only — yields views into the receiver, never owned copies" },
    { name: "splitView", sig: "(sep: string): &string pieces", note: "for-in only — yields views into the receiver, never owned copies" },
    { name: "codePoints", sig: "(): i32 code points", note: "for-in only — a parser desugar, not a value you can bind" },
    { name: "parseInt", sig: "(): Option<i64>" },
    { name: "parseF64", sig: "(): Option<f64>" },
    { name: "push", sig: "(c: u8)" },
    { name: "pushStr", sig: "(s: &string)" },
    { name: "cstr", sig: "(): *u8", note: "NUL-terminated view; the string must outlive the pointer" },
    { name: "clone", sig: "(): string" },
  ],

  vec: [
    { name: "len", sig: ": i64" },
    { name: "isEmpty", sig: "(): bool" },
    { name: "capacity", sig: "(): i64" },
    { name: "reserve", sig: "(extra: i64)" },
    { name: "push", sig: "(value: T)" },
    { name: "pop", sig: "(): Option<T>" },
    { name: "get", sig: "(index: i64): Option<T>" },
    { name: "first", sig: "(): Option<T>" },
    { name: "last", sig: "(): Option<T>" },
    { name: "insert", sig: "(index: i64, value: T)" },
    { name: "remove", sig: "(index: i64): T" },
    { name: "swap", sig: "(a: i64, b: i64)" },
    { name: "truncate", sig: "(len: i64)" },
    { name: "clear", sig: "()" },
    { name: "extend", sig: "(other: Vec<T>)", note: "moves other in" },
    { name: "retain", sig: "(pred)", note: "in-place filter" },
    { name: "reverse", sig: "()" },
    { name: "sort", sig: "()" },
    { name: "sortBy", sig: "(cmp)" },
    { name: "sortByKey", sig: "(key)" },
    { name: "slice", sig: "(start: i64, end: i64): &[T]" },
    { name: "contains", sig: "(value: T): bool" },
    { name: "indexOf", sig: "(value: T): Option<i64>" },
    { name: "position", sig: "(pred): Option<i64>" },
    { name: "join", sig: "(sep: string): string", note: "Vec<string> only" },
    { name: "map", sig: "(f): Vec<U>" },
    { name: "filter", sig: "(pred): Vec<T>" },
    { name: "fold", sig: "(init: A, f: (A, &T) => A): A" },
    { name: "reduce", sig: "(init: A, f: (A, &T) => A): A", note: "alias of fold" },
    { name: "each", sig: "(f)" },
    { name: "enumerate", sig: "(f)" },
    { name: "find", sig: "(pred): Option<T>" },
    { name: "any", sig: "(pred): bool" },
    { name: "all", sig: "(pred): bool" },
    { name: "sum", sig: "(): T" },
    { name: "min", sig: "(): Option<T>" },
    { name: "max", sig: "(): Option<T>" },
    { name: "ptr", sig: "(): *T", note: "backing data pointer; the Vec stays live in the caller" },
    { name: "clone", sig: "(): Vec<T>" },
  ],

  hashmap: [
    { name: "len", sig: ": i64" },
    { name: "isEmpty", sig: "(): bool" },
    { name: "insert", sig: "(key: K, value: V)" },
    { name: "get", sig: "(key: K): Option<V>" },
    { name: "getOrDefault", sig: "(key: K, fallback: V): V" },
    { name: "contains", sig: "(key: K): bool" },
    { name: "remove", sig: "(key: K)" },
    { name: "keys", sig: "(): Vec<K>" },
    { name: "values", sig: "(): Vec<V>" },
    { name: "clear", sig: "()" },
    { name: "clone", sig: "(): HashMap<K, V>" },
  ],

  // The Option and Result lists differ only where the types genuinely differ:
  // `mapErr` has no Option analogue because None carries no payload to map.
  // Everything else is deliberately symmetric — see docs/language-reference.md
  // §Option Combinators.
  option: [
    { name: "isSome", sig: "(): bool" },
    { name: "isNone", sig: "(): bool" },
    { name: "unwrapOr", sig: "(default: T): T", note: "Copy T only; '??' has no such limit" },
    { name: "unwrapOrElse", sig: "(f: () => T): T", note: "Copy T only; f runs only on None" },
    { name: "map", sig: "(f: (&T) => U): Option<U>" },
    { name: "andThen", sig: "(f: (&T) => Option<U>): Option<U>" },
    { name: "orElse", sig: "(f: () => Option<T>): Option<T>", note: "consumes a non-Copy receiver" },
  ],

  result: [
    { name: "isOk", sig: "(): bool" },
    { name: "isErr", sig: "(): bool" },
    { name: "unwrapOr", sig: "(default: T): T", note: "Copy T only; '??' has no such limit" },
    { name: "unwrapOrElse", sig: "(f: (&E) => T): T", note: "Copy T only; f runs only on Err" },
    { name: "map", sig: "(f: (&T) => U): Result<U, E>" },
    { name: "mapErr", sig: "(f: (&E) => F): Result<T, F>" },
    { name: "andThen", sig: "(f: (&T) => Result<U, E>): Result<U, E>" },
    { name: "orElse", sig: "(f: (&E) => Result<T, F>): Result<T, F>" },
  ],

  // Arithmetic that opts out of the default overflow trap, plus bit twiddling.
  // See docs/language-reference.md §Overflow — the trap is the default and there
  // is no flag to disable it globally, so these methods are the whole escape hatch.
  int: [
    { name: "toString", sig: "(): string" },
    { name: "wrappingAdd", sig: "(rhs: T): T" },
    { name: "wrappingSub", sig: "(rhs: T): T" },
    { name: "wrappingMul", sig: "(rhs: T): T" },
    { name: "wrappingNeg", sig: "(): T" },
    { name: "saturatingAdd", sig: "(rhs: T): T" },
    { name: "saturatingSub", sig: "(rhs: T): T" },
    { name: "saturatingMul", sig: "(rhs: T): T" },
    { name: "checkedAdd", sig: "(rhs: T): Option<T>" },
    { name: "checkedSub", sig: "(rhs: T): Option<T>" },
    { name: "checkedMul", sig: "(rhs: T): Option<T>" },
    { name: "checkedDiv", sig: "(rhs: T): Option<T>" },
    { name: "checkedRem", sig: "(rhs: T): Option<T>" },
    { name: "checkedNeg", sig: "(): Option<T>" },
    { name: "rotateLeft", sig: "(n: T): T" },
    { name: "rotateRight", sig: "(n: T): T" },
    { name: "reverseBits", sig: "(): T" },
    { name: "countOnes", sig: "(): i64" },
    { name: "leadingZeros", sig: "(): i64" },
    { name: "trailingZeros", sig: "(): i64" },
  ],

  float: [
    { name: "toString", sig: "(): string" },
  ],

  bool: [
    { name: "toString", sig: "(): string" },
  ],
};

// Names only, for "did you mean" candidate sets. Universal members are folded in
// so a typo of `addrOf` gets a suggestion on any receiver.
export function memberNames(receiver: BuiltinReceiver): string[] {
  return [...BUILTIN_MEMBERS[receiver], ...(receiver === "any" ? [] : BUILTIN_MEMBERS.any)]
    .map(m => m.name);
}

// The one-line detail an editor shows next to the name.
export function memberDetail(m: BuiltinMember): string {
  return m.note ? `${m.sig} — ${m.note}` : m.sig;
}

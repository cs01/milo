// Checked map lookup, replacing `map.get(k)!`.
//
// `!` is this codebase's `.unwrap()`, except worse than Rust's: `.unwrap()` panics at the
// call site with a location, while `!` lets `undefined` flow onward and surface as a
// TypeError forty frames away — or not at all, if the value is only interpolated into
// emitted IR, where it becomes the literal text "undefined" in a .ll file and fails at
// clang with no connection to the lookup that produced it.
//
// `must` is the loud version: same intent (this key is expected to be present), but the
// failure names the map and the key that was missing.
export function must<K, V>(map: { get(k: K): V | undefined }, key: K, what: string): V {
  const v = map.get(key);
  if (v === undefined) throw new Error(`internal: no ${what} for '${String(key)}'`);
  return v;
}

// Accepted (baselined) contract refutations: contracts `milo prove` reports as
// `failed` today that are NOT bugs — they are true facts the current native
// solver cannot establish (chiefly struct invariants, which prove-milo does not
// model yet — see docs/verification-roadmap.md). The gate fails on any refuted
// contract NOT listed here, so a genuinely broken contract breaks the build
// while these known solver limits do not. Burn this list down as the verifier
// gains power; the gate also flags a stale entry that has become provable.
//
// Key format: "<repo-relative-file>::<function>".
export const BASELINE: Record<string, string> = {
  "std/arena.milo::arenaLen":
    "ensures result >= 0 needs the struct invariant `live >= 0`, which prove-milo " +
    "cannot model yet (roadmap: struct invariants). `live` never actually goes " +
    "negative — free() generation-checks the handle and returns before the " +
    "decrement, so no valid double-free reaches `live = live - 1`.",

  "std/inflate.milo::fixed":
    "call-site preconditions `lencode.count.len >= 16` / `distcode.count.len >= 16` for " +
    "codes(). Both tables ARE 16 entries — they are built as `Huff { count: zeros(16) }` " +
    "and `zeros` carries `ensures result.len == n`, which the prover reads. What breaks " +
    "the chain is `construct(lencode, ...)` in between: it takes `&mut Huff`, so every " +
    "field of the table becomes a fresh unknown at that call, and there is no way to " +
    "write 'this &mut parameter preserves count.len' — `ensures` can only talk about " +
    "`result`. True because construct writes count[0..16] and never resizes it. Retire " +
    "with post-state contracts on &mut params (frame conditions).",

  "examples/embedded/pidStep.milo::pidStep":
    "call-site preconditions for fpMul(kp, error) / fpMul(ki, newIntegral) / " +
    "fpMul(kd, derivative). fpMul requires its args >= i32::MIN, which no i32 can " +
    "violate — but only PARAMS carry a range assumption, not intermediate arithmetic. " +
    "`error = setpoint - measured` is a subtraction of two i32s, so the unbounded-Int " +
    "model lets it reach -2^32 and refutes. In the real program that subtraction would " +
    "trap on overflow in a debug build long before fpMul is reached, so the values are " +
    "always in range. Needs range-carrying arithmetic (or a bitvector model) to retire.",
};

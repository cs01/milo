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
  "examples/embedded/pidStep.milo::pidStep":
    "call-site preconditions for fpMul(kp, error) / fpMul(ki, newIntegral) / " +
    "fpMul(kd, derivative). fpMul requires its args >= i32::MIN, which no i32 can " +
    "violate — but only PARAMS carry a range assumption, not intermediate arithmetic. " +
    "`error = setpoint - measured` is a subtraction of two i32s, so the unbounded-Int " +
    "model lets it reach -2^32 and refutes. In the real program that subtraction would " +
    "trap on overflow in a debug build long before fpMul is reached, so the values are " +
    "always in range. Needs range-carrying arithmetic (or a bitvector model) to retire.",
};

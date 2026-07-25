// Per-file prove-verdict ratchet. The refutation baseline next door answers "is any
// contract PROVEN FALSE"; this answers the quieter question "is any contract still
// proven at all". Without it, a contract that degrades from `proven` to `unknown` —
// someone adds a float literal, drops an `ensures` off a callee, rewrites a loop past
// the invariant — leaves the build green, because `unknown` was never a failure. The
// contract text stays in the source looking like a guarantee while nothing checks it.
// That is how unproven contracts accumulate as false confidence.
//
// Direction of each bound:
//   proven  — floor.   Losing a proof fails the gate.
//   unknown — ceiling. A newly-undecidable contract fails the gate.
//   errors  — ceiling. Same, for translator/solver errors.
// Movement the good way (more proven, fewer unknown) is reported, not failed, and the
// numbers here should be updated to lock the gain in: `bun scripts/verify-contracts.ts --update`.
//
// A file absent from this map is reported but does not fail — a new example must not
// break CI on arrival. Add it when it lands. Platform variants only appear for the host
// that proves them (`.darwin.` here, `.linux.` on a Linux runner), so both sets coexist.
export interface Expected {
  proven: number;
  unknown: number;
  errors: number;
}

export const EXPECTED: Record<string, Expected> = {
  // 0 proven / 30 unknown / 8 errors: this file's contracts are documentation today.
  // The errors are `unknown constant s_len` — the translator flattens `s.len` into a
  // symbol it never declares. Fixing that turns errors into real verdicts.
  "examples/embedded/flightController.milo": { proven: 0, unknown: 30, errors: 8 },
  // 3 refuted here are baselined (unbounded-Int model of `setpoint - measured`).
  "examples/embedded/pidStep.milo": { proven: 7, unknown: 1, errors: 0 },
  "std/arena.milo": { proven: 0, unknown: 0, errors: 0 },
  // 0 conditions, and correctly so: this file's contracts are all `requires`, which are
  // discharged at call sites. Nothing in the proved set calls them, so nothing is
  // checked. A floor of 0 pins that fact rather than hiding it — see MILO_VERIFY_ALL.
  "std/crypto.darwin.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/crypto.windows.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/inflate.milo": { proven: 18, unknown: 23, errors: 7 },
  "std/math.milo": { proven: 4, unknown: 1, errors: 0 },
  "std/mem.milo": { proven: 2, unknown: 1, errors: 0 },
  "std/pool.milo": { proven: 6, unknown: 1, errors: 0 },
  "std/process.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/process.windows.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/pty.darwin.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/pty.windows.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/sort.milo": { proven: 2, unknown: 0, errors: 0 },
  "std/string.milo": { proven: 2, unknown: 3, errors: 2 },
  "std/sync.milo": { proven: 0, unknown: 0, errors: 0 },
};

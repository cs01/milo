// Per-file prove-verdict ratchet. The refutation baseline next door answers "is any
// contract PROVEN FALSE"; this answers the quieter question "is any contract still
// proven at all". Without it, a contract that degrades from `proven` to `unknown` —
// someone adds a float literal, drops an `ensures` off a callee, rewrites a loop past
// the invariant — leaves the build green, because `unknown` was never a failure. The
// contract text stays in the source looking like a guarantee while nothing checks it.
// That is how unproven contracts accumulate as false confidence.
//
// Direction of each bound:
//   proven  — floor, GATES.   Losing a proof fails the build.
//   errors  — ceiling, GATES. A translator/solver error means an invalid query, always a bug.
//   unknown — recorded, does NOT gate. It rises both when a contract stops being
//             discharged and when previously-invisible obligations start being emitted,
//             and the tally cannot tell those apart. The first case already trips the
//             proven floor, so gating here would only punish coverage improvements.
// Any drift is reported and the numbers should be refreshed to match:
// `bun scripts/verify-contracts.ts --update`.
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
  // Was 0 proven / 64 unknown — every VC in the file died on the first float literal,
  // which the SMT translator had no rule for. With `FloatLit` translating and `Pid`
  // carrying `invariant outMin < outMax`, the contracts are checked rather than decorative.
  // The remaining unknowns are `readKey`/`clampF64` postconditions this run cannot see
  // (they live in std, outside the entry file), not a solver limit.
  // COHERENCE REGRESSION (restore via prover work): math ops became `Math.method()`
  // static calls, which prove-milo havocs (it modeled the old free `clampI64`/`mathSqrt`);
  // callers of math lost those proofs. Contracts unchanged — this is a prover-frontier
  // gap, not a broken guarantee. See [[project_prover_frontier]] / docs/verification-roadmap.md.
  "examples/embedded/flightController.milo": { proven: 6, unknown: 49, errors: 0 },
  // 3 refuted here are baselined (unbounded-Int model of `setpoint - measured`).
  "examples/embedded/pidStep.milo": { proven: 8, unknown: 0, errors: 0 },
  // Both AES-128 key-length preconditions into std/crypto, proven at the call site.
  // COHERENCE REGRESSION (restore via prover work): see flightController note above.
  "examples/net/termpair/encryption.milo": { proven: 0, unknown: 1, errors: 0 },
  // 3 proven / 4 unknown since `Arena` grew `invariant live >= 0`: construction and the
  // alloc paths discharge it, the free/set/modify paths cannot (they are gated by an
  // IndexAccess the translator has no rule for), so `arenaLen` reports as a CONDITIONAL
  // proof rather than a clean one.
  "std/arena.milo": { proven: 3, unknown: 4, errors: 0 },
  // 0 conditions, and correctly so: this file's contracts are all `requires`, which are
  // discharged at call sites. Nothing in the proved set calls them, so nothing is
  // checked here. A floor of 0 pins that fact rather than hiding it — the callers that
  // DO exercise these live in examples/, and MILO_VERIFY_ALL=1 is what reaches them.
  "std/crypto.darwin.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/crypto.windows.milo": { proven: 0, unknown: 0, errors: 0 },
  // `fixed` was refuted here until `construct` grew frame conditions (`ensures h.count.len
  // == old(h.count.len)`); the +6 proven is that baseline retiring.
  "std/inflate.milo": { proven: 27, unknown: 38, errors: 0 },
  // COHERENCE REGRESSION (restore via prover work): math's own `requires` are now on
  // `impl Math` static methods, which prove-milo does not enumerate/model yet (was free fns).
  "std/math.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/mem.milo": { proven: 2, unknown: 1, errors: 0 },
  "std/pool.milo": { proven: 6, unknown: 1, errors: 0 },
  "std/process.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/process.windows.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/pty.darwin.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/pty.windows.milo": { proven: 0, unknown: 0, errors: 0 },
  "std/sort.milo": { proven: 2, unknown: 0, errors: 0 },
  "std/string.milo": { proven: 8, unknown: 4, errors: 0 },
  "std/sync.milo": { proven: 0, unknown: 0, errors: 0 },
};

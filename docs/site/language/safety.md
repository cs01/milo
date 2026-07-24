# Contracts & Safety

Milo lets you write down what your functions promise — and then prove it.

- **Contracts** (`requires`, `ensures`, `invariant`) are annotations that say what a function expects, what it guarantees, and what stays true inside loops. The compiler type-checks them alongside your code — no separate annotation language, no external tool needed just to write them.
- **Safety profiles** enforce coding standards from domains like avionics (DO-178C), automotive (ISO 26262), and medical devices (IEC 62304) — as compiler flags, not expensive third-party tools.

## When a contract is checked

Take a logarithm that only accepts positive inputs:

```milo
pub fn log2(x: f64): f64
requires x > 0.0
{ ... }
```

There are three separate moments where `x > 0.0` can be enforced. They are independent — the first and third always apply, the second only if you ask for it.

**1. At compile time, at every optimization level.** If the compiler can see the argument value, it rejects the program. `log2(-1.0)` does not build:

```
error: requires clause 'x > 0.0' violated
  ──> main.milo:10:11
```

This only reaches as far as constant folding does. A value read from a file or a sensor is invisible to it.

**2. At compile time, when you run `milo prove`.** A separate command — `build` never runs it. It proves the contract holds for *every* input, not just the visible ones, and reports which obligations it could not decide. It does not change the binary.

**3. At runtime, in `--debug` builds only.** Each `requires`, `ensures`, and `invariant` becomes an assert. Passing a negative value that reached your program at runtime prints and exits 1:

```
runtime error: requires clause violated at math.milo:2
```

At `-O1`/`-O2`/`-O3` — the default for `milo build` — no check is emitted and the contract costs nothing. `--overflow-checks` turns the runtime asserts on at any optimization level.

Contracts are for *logic* errors. Memory safety is already handled elsewhere: ownership and move checking reject use-after-free and double-free at compile time, bounds checks stay on at every optimization level, and arenas use generational handles. None of those catch a negative logarithm.

## Why types aren't enough

Types catch a lot — you can't pass a `String` where an `i64` is expected. But they can't express *value* constraints. Consider a square root function:

```milo
fn sqrt(n: f64): f64 {
    // ...
}
```

The type system says `n` is an `f64`. It doesn't say `n` must be non-negative — so a caller can pass `-1.0` and get garbage (or a panic) at runtime. That's a logic error hiding behind a perfectly valid type signature.

With a contract, the constraint is explicit and compiler-checked:

```milo
fn sqrt(n: f64): f64
  requires n >= 0.0
  ensures result >= 0.0
{
    // ...
}
```

`result` is a special keyword in `ensures` clauses — it refers to the return value of the function.

Now anyone reading this function knows exactly what it needs and what it promises.

What about runtime values? If `n` comes from a sensor reading, nobody can prove it's non-negative at compile time. That's not what verification does. What `milo prove` checks is the *chain of proof obligations*: if you call `sqrt(sensorValue)` without first checking `sensorValue >= 0.0`, the prover flags it. You still write a runtime check at the boundary where unknown data enters — the proof just guarantees you never forgot one.

```milo
fn processSensor(raw: f64): f64 {
    if raw < 0.0 {
        return 0.0           // handle the bad case
    }
    return sqrt(raw)          // verifier knows raw >= 0.0 here
}
```

This is the gap contracts fill: **types describe the shape of data, contracts describe the rules about values.** Milo already rules out the memory bugs — use-after-free and double-free at compile time via ownership and move checking, out-of-bounds via bounds checks that stay on at every optimization level, null dereferences by not having null. Contracts extend that to logic errors — the bugs that memory safety alone can't catch, and that runtime checks alone can't guarantee you remembered everywhere.

## Why an SMT solver?

The compiler checks that contracts are **well-typed** — every `requires`, `ensures`, and `invariant` must be a valid `bool` expression using in-scope variables. That's a syntactic and type-level check, similar to how the compiler rejects `let x: i64 = "hello"`.

But type-checking a contract doesn't tell you whether it *holds*. Consider:

```milo
fn clamp(value: i64, lo: i64, hi: i64): i64
  requires lo <= hi
  ensures result >= lo && result <= hi
{ ... }
```

The compiler confirms `lo <= hi` is a valid boolean expression over `i64` parameters. Where the argument values are visible at the call site it goes further and rejects the call outright:

```
error: requires clause 'n >= 0' violated
  ──> main.milo:10:11
10 │     print(half(-8))
   │           ^
```

But that only reaches as far as constant folding does. Whether `clamp` upholds its postcondition on *every* path, for every symbolic input, is a semantic property that requires reasoning about values, paths, and arithmetic — exactly what SMT solvers are designed for.

`milo prove` bridges the gap: it translates contracts into SMT-LIB2 formulas encoding "can this contract be violated?", including a path-sensitive encoding of the function body, and discharges them. `unsat` means no violation is possible; `sat` means there's a concrete counterexample.

**In short:** the compiler catches *ill-formed* contracts and locally-obvious violations. The solver catches the rest — violations that only show up over symbolic inputs and all paths. Anything the solver leaves `unknown` is still caught at runtime in a `--debug` build.

## WCET analysis

Worst-Case Execution Time (WCET) analysis determines the maximum time a function can take to execute — a hard requirement for real-time systems like flight controllers, ABS brakes, and pacemakers. Missing a deadline in these systems is as bad as computing the wrong answer.

WCET analysis tools need to bound every execution path, which means the code must satisfy structural constraints: no unbounded loops, no recursion, no dynamic allocation (which has unpredictable latency), and bounded complexity. These are exactly the constraints that Milo's safety profiles enforce.

When you compile with `--safety=do178c-a` or `--safety=iec61508-4`:

- **No recursion** → call graph is a DAG, so execution time is statically bounded
- **Bounded loops** → every `while` loop has an `invariant`, providing the foundation for iteration bounds
- **No dynamic allocation** → no heap allocator jitter, no GC pauses
- **Complexity limits** → functions stay small enough for path enumeration

This means code that passes `milo safety` is structurally ready for WCET analysis by tools like [aiT](https://www.absint.com/ait/) or [Bound-T](https://www.bound-t.com/). Without these constraints, WCET tools must either reject the code or produce pessimistic bounds that overestimate timing by orders of magnitude.

Contracts add further value: a `requires` clause like `requires n <= 1000` gives WCET tools an explicit bound on input ranges, tightening the analysis. Combined with the safety profile's structural guarantees, you get a codebase that is both *provably correct* (via SMT) and *provably timely* (via WCET).

---

## Contracts

Three keywords: `requires` (precondition), `ensures` (postcondition), and `invariant` (loop invariant). Each takes a boolean expression.

### Preconditions — `requires`

State what must be true when a function is called:

```milo
fn clamp(value: i64, lo: i64, hi: i64): i64
  requires lo <= hi
{
    if value < lo { return lo }
    if value > hi { return hi }
    return value
}
```

Multiple `requires` clauses are allowed — all must hold:

```milo
fn divide(a: i64, b: i64): i64
  requires b != 0
  requires a >= 0
{
    return a / b
}
```

### Postconditions — `ensures`

State what the function guarantees about its return value. The special variable `result` refers to the return value:

```milo
fn clamp(value: i64, lo: i64, hi: i64): i64
  requires lo <= hi
  ensures result >= lo && result <= hi
{
    if value < lo { return lo }
    if value > hi { return hi }
    return value
}
```

### Loop invariants — `invariant`

State what remains true across every iteration of a loop:

```milo
fn sumTo(n: i64): i64
  requires n >= 0
  ensures result >= 0
{
    var total: i64 = 0
    var i: i64 = 1
    while i <= n
      invariant total >= 0
      invariant i >= 1
    {
        total = total + i
        i = i + 1
    }
    return total
}
```

### What the compiler checks

The compiler type-checks contract expressions — every `requires`, `ensures`, and `invariant` must evaluate to `bool`. Non-boolean expressions are rejected at compile time:

```
error: requires clause must be bool, got i64
  --> example.milo:2:12
  |
2 |   requires x + 1
  |            ^^^^^
```

Beyond well-typedness, the compiler rejects call sites whose arguments it can constant-fold into a `requires` violation. Everything else is left to `milo prove`.

## Proving contracts — `milo prove`

`milo prove` generates the verification conditions and discharges them. No external solver is required: the default engine is `std/smt`, a prover written in Milo itself.

```bash
milo prove tests/fixtures/contracts.milo
```

```
verification: 4 conditions
  proven: 3  failed: 0  unknown: 1  errors: 0

  ✓ [postcondition] clamp: proven
  ? [postcondition] factorial: unknown — outside linear fragment (std/smt)
  ✓ [precondition] main: proven
  ✓ [precondition] main: proven
```

Three outcomes, and the difference matters. `proven` means the condition holds on every path, for every input. `failed` means there is a counterexample. `unknown` means the engine could not decide it — that is a limit of the engine, not a defect in your contract, and it is never reported as a failure.

### Two engines

`milo prove` builds the proof obligations, then hands them to a solver. There are two, and they differ only in what mathematics they understand:

| | `std/smt` (default) | `--solver=z3` |
|---|---|---|
| What it is | a solver written in Milo, in the standard library | the external [Z3](https://github.com/Z3Prover/z3) program |
| Install | none — compiled once to a cached binary | you install it yourself; must be on `PATH` |
| Decides | linear integer arithmetic: `+`, `-`, comparisons, multiplication by a constant | the above, plus non-linear arithmetic (`n * n`, `n * factorial(n - 1)`) |

The obligations are identical either way. Anything `std/smt` returns `unknown` on is worth retrying with Z3:

```bash
milo prove flight_controller.milo --solver=z3      # same conditions, bigger solver
milo prove flight_controller.milo --all            # include imported stdlib
```

```
? [postcondition] factorial: unknown — outside linear fragment (std/smt)
✓ [postcondition] factorial: proven                                        # same condition, --solver=z3
```

A call inside a function body is modelled by the callee's own `ensures` rather than by inlining it, which is what lets `factorial` above be proven from its own postcondition. For a self-recursive call that is induction, and Milo has no termination checker — so a proof involving recursion is conditional on the recursion terminating.

### Exporting the raw conditions — `milo verify`

`milo verify` emits the underlying [SMT-LIB2](https://smtlib.cs.uiowa.edu/) so you can pipe it to [Z3](https://github.com/Z3Prover/z3), [CVC5](https://cvc5.github.io/), or your own tooling:

```bash
milo verify flight_controller.milo
```

```
── postcondition ── clamp ──
postcondition of clamp: (and (>= result lo) (<= result hi))
; Postcondition proof for clamp
(set-logic ALL)
(declare-const value Int)
(declare-const lo Int)
(declare-const hi Int)
(declare-const result Int)
(assert (<= lo hi))
(assert (or (and (< value lo) (= result lo)) (and (and (not (< value lo)) (> value hi)) (= result hi)) (and (and (not (< value lo)) (not (> value hi))) (= result value))))
(assert (not (and (>= result lo) (<= result hi))))
(check-sat)
```

The middle `assert` is the function body: one disjunct per return path, each guarded by the branch conditions that reach it. The last `assert` negates the postcondition, so `unsat` means the postcondition always holds and `sat` yields a counterexample.

**Current limitations:** the encoding covers preconditions, postconditions, and loop invariants over scalar arithmetic, plus calls modelled through the callee's `ensures`. Outside that — bitwise operators, indexing, method calls, `Vec` lengths through a builder, struct fields as loop invariants, and calls to functions that declare no `ensures` — conditions come back `unknown`, never a false `failed`. Build with `--debug` to catch those at runtime instead.

This approach — contracts as source-level annotations, discharged by a solver — is the same architecture as SPARK/Ada and Dafny. Unlike SPARK, Milo ships its prover in the standard library, so the common case needs nothing installed; Z3 or CVC5 are opt-in for the theories `std/smt` doesn't model yet.

## Safety profiles — `milo safety`

Safety-critical domains have coding standards that restrict what language features are allowed. Milo can check your code against these standards at compile time.

```bash
milo safety flight_controller.milo --safety=do178c-a
```

### Available profiles

```bash
milo safety --list
```

| Domain | Standard | Profiles | Governs |
|--------|----------|----------|---------|
| Avionics | DO-178C | `do178c-a`, `do178c-b`, `do178c-c` | Airborne software (DAL A–C) |
| Automotive | ISO 26262 | `iso26262-a` through `iso26262-d` | Vehicle ECUs, ADAS (ASIL A–D) |
| Spacecraft | NASA-STD-8739.8 | `nasa-a`, `nasa-b` | Flight software (Class A–B) |
| Industrial | IEC 61508 | `iec61508-3`, `iec61508-4` | Nuclear, rail signaling (SIL 3–4) |
| Medical | IEC 62304 | `iec62304-a`, `iec62304-b`, `iec62304-c` | Device software (Class A–C) |

### What gets checked

Each profile is a combination of constraints, tuned to the standard's requirements:

| Constraint | Description | Strictest at |
|------------|-------------|-------------|
| No recursion | Direct self-calls banned | DO-178C A, IEC 61508 SIL 4 |
| Bounded loops | `while` loops must have `invariant` clauses | DO-178C A, NASA A |
| No dynamic allocation | No Vec, String, HashMap construction | IEC 61508 SIL 4 |
| Require contracts | All functions need `requires`/`ensures` | DO-178C A, NASA A |
| No floating point | Integer-only arithmetic (no `f32`/`f64` in signatures, locals, casts, or literals) | IEC 61508 SIL 4 |
| No recursive types | Self-referential types banned even through `Heap<T>` — recursive data has unbounded traversal depth | DO-178C A, IEC 61508 SIL 4 |
| Max call depth | Longest static call chain bounded (call graph is a DAG since recursion is banned) | IEC 61508 SIL 4 (max 20) |
| Complexity limit | Cyclomatic complexity cap per function | IEC 61508 SIL 4 (max 15) |
| No unsafe blocks | `unsafe { }` banned entirely | All profiles |
| Full match coverage | All `match` arms required (enforced by the type checker's exhaustiveness pass) | Most profiles |

Example output when violations are found:

```
safety check failed: do178c-a — 3 violation(s)

  error: [do178c-a] function 'processInput' must have requires/ensures contracts
  error: [do178c-a] function 'processInput' contains recursion (banned at this safety level)
  error: [do178c-a] while loop in 'processInput' must have an invariant clause for bounded execution
```

### Integrating with CI

Add safety checking to your build pipeline:

```bash
milo safety src/controller.milo --safety=do178c-a || exit 1
```

The command exits with code 1 if any errors are found, making it suitable for CI gates.

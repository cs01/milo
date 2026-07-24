# Contracts & Safety

Milo lets you write down what your functions promise — and then prove it.

- **Contracts** — `requires`, `ensures`, `invariant`: what a function expects, what it guarantees, what stays true in a loop. Type-checked like the rest of your code.
- **`milo prove`** checks that they hold — for every input, without running the program.
- **Safety profiles** — DO-178C, ISO 26262, IEC 62304 and friends, enforced as compiler flags.

## Walkthrough

Let's say you have a function that computes an integer square root. It is undefined for negative input, and it never returns a negative one — that's one `requires` and one `ensures`:

```milo
// sqrt.milo
pub fn sqrt(n: i64): i64
requires n >= 0
ensures result >= 0
{
    var r: i64 = 0
    while (r + 1) * (r + 1) <= n {
        r = r + 1
    }
    return r
}
```

What decides when `n >= 0` gets enforced is **not** the optimization level. It is whether the compiler can see the value.

### 1. A value it can see — rejected at compile time, in every build

```milo
pub fn main(): i32 {
    print(sqrt(-1))
    return 0
}
```

```
$ milo build sqrt.milo -o sqrt
error: requires clause 'n >= 0' violated
  ──> sqrt.milo:14:11
   │
14 │     print(sqrt(-1))
   │           ^
```

Identical output under `--debug` and under `--release`. This is not a debug-only check — you cannot build this program at any optimization level.

### 2. A value it can't see — asserted at runtime, in debug builds only

Let's say the value passed to `sqrt` is no longer a constant, but a variable that is not known at compile time. Here it depends on how the program was invoked, so there is nothing for the compiler to fold:

```milo
from "std/args" import { args }

pub fn main(): i32 {
    var reading: i64 = -1
    if args().len() > 99 {
        reading = 49
    }
    print(sqrt(reading))
    return 0
}
```

This compiles. What happens next depends on the build:

```
$ milo build sqrt.milo -o sqrt && ./sqrt
0                                                    # -O2 (default): no check emitted
$ echo $?
0

$ milo build sqrt.milo --debug -o sqrt && ./sqrt
runtime error: requires clause violated at sqrt.milo:5
$ echo $?
1
```

At `-O1`/`-O2`/`-O3` the contract costs nothing and catches nothing. `--debug` turns every `requires`, `ensures`, and `invariant` into an assert; `--overflow-checks` does the same at any optimization level.

### 3. `milo prove` — catch it statically instead

Neither of the two cases above covers what you actually worry about: a value that only goes negative on some input you never thought to test. That is what the prover is for. Let's say a `scale` function forwards its argument straight through without checking it:

```milo
pub fn scale(raw: i64): i64 {
    return sqrt(raw)
}
```

```
$ milo prove sqrt.milo
verification: 2 conditions
  proven: 1  failed: 1  unknown: 0  errors: 0

  ✓ [postcondition] sqrt: proven
  ✗ [precondition] scale: failed — counterexample: raw = -1
$ echo $?
1
```

Nothing was run and no input was supplied — the solver derived `raw = -1` by itself. And notice what it proved along the way: `ensures result >= 0` holds for *every* `n`, which no amount of testing can establish.

### 4. Add the guard, and the proof goes through

```milo
pub fn scale(raw: i64): i64 {
    if raw < 0 {
        return 0
    }
    return sqrt(raw)
}
```

```
$ milo prove sqrt.milo
verification: 2 conditions
  proven: 2  failed: 0  unknown: 0  errors: 0

  ✓ [postcondition] sqrt: proven
  ✓ [precondition] scale: proven
$ echo $?
0
```

The guard is ordinary code — you still write the runtime check where unknown data enters. What the proof adds is the guarantee that you never forgot one. `milo prove` exits non-zero on a failed condition, so that guarantee holds in CI.

Contracts are for *logic* errors. Memory safety is already handled elsewhere: ownership and move checking reject use-after-free and double-free at compile time, bounds checks stay on at every optimization level, and arenas use generational handles. None of those catch `sqrt(-1)`.

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

A fair objection to the walkthrough: its `requires n >= 0` is on an `i64`, and declaring `n: u64` would carry that constraint in the type instead. True — where a type *can* state the rule, use the type. Contracts are for the rules no type can hold:

```milo
pub fn clamp(value: i64, lo: i64, hi: i64): i64
requires lo <= hi                              // a relation between two arguments
ensures result >= lo && result <= hi           // the result related back to them
```

No signedness helps here. `lo <= hi` is a fact about two arguments together, and `result <= hi` ties the return value to an argument — neither is expressible as a type, in Milo or anywhere else. Floats make the same point from the other side: there is no unsigned `f64`, so `requires x > 0.0` has nowhere to live but a contract.

This is the gap contracts fill: **types describe the shape of data, contracts describe the rules about values.** Milo already rules out the memory bugs — use-after-free and double-free at compile time via ownership and move checking, out-of-bounds via bounds checks that stay on at every optimization level, null dereferences by not having null. Contracts extend that to logic errors — the bugs that memory safety alone can't catch, and that runtime checks alone can't guarantee you remembered everywhere.

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
| On a failure | names the values: `counterexample: raw = -1` | reports `counterexample exists` |

The obligations are identical either way. Anything `std/smt` returns `unknown` on is worth retrying with Z3:

```bash
milo prove flight_controller.milo --solver=z3      # same conditions, bigger solver
milo prove flight_controller.milo --all            # include imported stdlib
```

```
? [postcondition] factorial: unknown — outside linear fragment (std/smt)
✓ [postcondition] factorial: proven                                        # same condition, --solver=z3
```

A call inside a function body is modelled by the callee's contract rather than by inlining it, which is what lets `factorial` above be proven from its own postcondition. Two consequences worth knowing:

- What gets assumed is `requires` **implies** `ensures`, never the bare `ensures`. A callee only promises its postcondition to callers that met its precondition, and assuming the bare form would be circular — discharging `lo <= hi` at a call to `clamp` would get to assume `lo <= result <= hi`, which entails the very thing being proved.
- For a self-recursive call this is induction, and Milo has no termination checker. A proof involving recursion is therefore conditional on the recursion terminating.

### Seeing the raw conditions — `prove --emit-smt`

Same command, same obligations — `--emit-smt` prints them as [SMT-LIB2](https://smtlib.cs.uiowa.edu/) instead of solving them. Nothing is filtered; the count matches what `milo prove` reports on the same file.

(`milo verify` is the old spelling of this. It still works and prints a deprecation warning.)

Three reasons to want the text: to drive a solver Milo doesn't bundle ([CVC5](https://cvc5.github.io/)), to understand an `unknown`, or to archive the obligations as certification evidence.

Step 3 of the walkthrough is the same condition seen both ways. As a verdict:

```
$ milo prove sqrt.milo
  ✗ [precondition] scale: failed — counterexample: raw = -1
```

and as the formula behind it:

```
$ milo prove sqrt.milo --emit-smt
── precondition ── scale ──
call to sqrt from scale: (>= raw 0)
; Call-site precondition proof: scale -> sqrt
(set-logic ALL)
(declare-const raw Int)
(assert (not (>= raw 0)))
(check-sat)
```

Read it as a question: "can `raw >= 0` fail?" The last `assert` negates the obligation, so `sat` means yes, it can — and `raw = -1` is the witness `prove` reported back.

A postcondition is bigger, because the function body has to be encoded too:

```
$ milo prove clamp.milo --emit-smt
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

The long `assert` is the body: one disjunct per return path, each guarded by the branch conditions that reach it. Same shape as before — the last `assert` negates the obligation, so here `unsat` is the good answer.

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

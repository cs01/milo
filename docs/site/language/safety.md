# Contracts & Safety

Milo lets you write down what your functions promise — and then prove it.

- **Contracts** — `requires`, `ensures`, `invariant`: what a function expects, what it guarantees, what stays true in a loop. Type-checked like the rest of your code.
- **`milo prove`** checks that they hold — for every input, without running the program.
- **Safety profiles** — DO-178C, ISO 26262, IEC 62304 and friends, enforced as compiler flags.

## Walkthrough

Let's say you have a function that computes an integer square root. It is undefined for negative input, and it never returns a negative one. The contract says exactly that: the caller must pass `n >= 0` (`requires`), and in return the result is never negative (`ensures`):

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

`result` is a keyword, valid in `ensures` clauses: it stands for the return value.

With the contract in place, there are three ways it gets enforced. Which one you get is **not** decided by the optimization level — it is decided by whether the compiler can see the value.

### 1. A static value — rejected at compile time

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

### 2. An unpredictable value — asserted at runtime in debug builds

Let's say the value passed to `sqrt` is no longer a constant, but a number drawn at runtime. There is nothing left for the compiler to fold:

```milo
from "std/random" import { randRange }

pub fn main(): i32 {
    let reading: i64 = randRange(-100, 100)
    print(sqrt(reading))
    return 0
}
```

This compiles. What happens on a negative draw depends entirely on the build.

**Release builds** — `-O1`, `-O2`, `-O3`, the default for `milo build`. No assertion is emitted, so the contract costs nothing and catches nothing:

```
$ milo build sqrt.milo -o sqrt && ./sqrt
0                      # negative draw: sqrt returned a meaningless 0
$ echo $?
0
```

**Debug builds** — `--debug`. Every `requires`, `ensures`, and `invariant` becomes a runtime assert, naming the clause that failed and its line:

```
$ milo build sqrt.milo --debug -o sqrt && ./sqrt
runtime error: requires clause violated at sqrt.milo:5
$ echo $?
1
```

`--overflow-checks` turns those same asserts on at any optimization level, if you want them in a release build.

### 3. `milo prove` — proven for every input, before you run it

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

**Now that we have the violation of the contract, we can modify the code to satisfy it, then run the prover again.**

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

The negative never reaches `sqrt` now — `raw < 0` returns `0`, a defined result on a path you wrote — so there is nothing left to abort on, and no runtime assert is doing the work. `proven` means every input is handled in ordinary code; a runtime assert only backstops what you haven't established. Anything still `unknown` is yours to catch, and `milo prove` exits non-zero on a failure, so CI enforces the difference.

### Which solver

By default `milo prove` uses `std/smt`, a solver written in Milo and shipped in the standard library, so the walkthrough above needs nothing installed. It is not in Z3's league: it decides linear integer arithmetic — `+`, `-`, comparisons, multiplication by a constant — and returns `unknown` on the rest, including `n * n` and recursion. Pass `--solver=z3` to send the same obligations to Z3, which decides those too, or `--emit-smt` to print them as SMT-LIB2 for another tool.

## What types can't say

A fair objection to the walkthrough: its `requires n >= 0` is on an `i64`, and declaring `n: u64` would carry that constraint in the type instead. True — where a type *can* state the rule, use the type. Contracts are for the rules no type can hold:

```milo
pub fn clamp(value: i64, lo: i64, hi: i64): i64
requires lo <= hi                              // a relation between two arguments
ensures result >= lo && result <= hi           // the result related back to them
```

No signedness helps here. `lo <= hi` is a fact about two arguments together, and `result <= hi` ties the return value to an argument — neither is expressible as a type, in Milo or anywhere else. Floats make the same point from the other side: there is no unsigned `f64`, so `requires x > 0.0` has nowhere to live but a contract.

This is the gap contracts fill: **types describe the shape of data, contracts describe the rules about values.** Milo already rules out the memory bugs — use-after-free and double-free at compile time via ownership and move checking, out-of-bounds via bounds checks that stay on at every optimization level, null dereferences by not having null. Contracts extend that to logic errors — the bugs that memory safety alone can't catch, and that runtime checks alone can't guarantee you remembered everywhere.

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

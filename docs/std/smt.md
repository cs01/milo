# std/smt

## std/smt

### `addAtom`

```milo
pub fn addAtom(p: &mut SmtProblem, row: Vec<i64>, konst: i64, strict: bool): i64
```

Register an atom  row·x + konst <op> 0 ; returns its atom index.

### `allReal`

```milo
pub fn allReal(varIsInt: &Vec<bool>, nvars: i64): bool
```

Does every variable this row actually constrains range over the integers? A zero
coefficient contributes nothing, so a real variable the row does not mention cannot
block the tightening.
No integer variable anywhere in the problem, so nothing is a relaxation.

### `ceilDiv`

```milo
pub fn ceilDiv(a: i64, b: i64): i64
```

ceil(a / b) for b > 0, on top of Milo's truncating division. Truncation already
rounds toward zero, which IS the ceiling for a negative numerator; only a positive
remainder needs the bump.

### `cloneRow`

```milo
pub fn cloneRow(row: &Vec<i64>): Vec<i64>
```

_Undocumented._

### `combine`

```milo
pub fn combine(p: &Constraint, n: &Constraint, k: i64, varIsInt: &Vec<bool>): Option<Constraint>
```

Combine upper row p (coeff +a on x_k) with lower row n (coeff -b): b*p + a*n.
None when the arithmetic overflows — see combineTerm.

### `combineTerm`

```milo
pub fn combineTerm(b: i64, pj: i64, a: i64, nj: i64): Option<i64>
```

b*p[j] + a*n[j], or None if any step overflows i64.

This is the soundness seam. Fourier-Motzkin multiplies constants together, so a konst
anywhere near 2^62 overflows on the first combine. Wrapping (the -O2 behaviour) flips
the sign, the row becomes nonsense, the system looks infeasible, and `decide` reports
UNSAT — i.e. **proven**. A false proof is the worst answer a prover can give, so an
overflow must reach the caller as "cannot decide" and never as a verdict.

### `decide`

```milo
pub fn decide(p: &SmtProblem, root: i64): Verdict
```

_Undocumented._

### `eliminateVar`

```milo
pub fn eliminateVar(cs: &Vec<Constraint>, k: i64, varIsInt: &Vec<bool>): Option<Vec<Constraint>>
```

None when any combine overflows — the caller must not read that as infeasible.

### `evalNode`

```milo
pub fn evalNode(p: &SmtProblem, node: i64, mask: i64): bool
```

_Undocumented._

### `feasibleRational`

```milo
pub fn feasibleRational(cs0: &Vec<Constraint>, nvars: i64, varIsInt: &Vec<bool>): Option<bool>
```

Feasible over the rationals? Eliminate every variable; a surviving constant
row that is violated proves the system UNSAT.
None = the elimination overflowed, so feasibility is undecided here. Returning `false`
(infeasible) in that case is what produced false proofs.

### `findWitness`

```milo
pub fn findWitness(cs: &Vec<Constraint>, nvars: i64, bound: i64, maxIters: i64): Vec<i64>
```

Odometer search for a concrete integer witness, each coordinate ranging over
zigzag steps [0, 2*bound] so nearer-zero points are tried first. Capped at
maxIters so a high-dimensional box can't blow up. Empty result = none found.

### `gcd2`

```milo
pub fn gcd2(a: i64, b: i64): i64
```

_Undocumented._

### `inducedConstraints`

```milo
pub fn inducedConstraints(p: &SmtProblem, mask: i64): Vec<Constraint>
```

Build the conjunction induced by a truth assignment: atom i as-is when its
bit is set, negated otherwise.

### `nAnd`

```milo
pub fn nAnd(p: &mut SmtProblem, kids: Vec<i64>): i64
```

_Undocumented._

### `nAtom`

```milo
pub fn nAtom(p: &mut SmtProblem, atomIdx: i64): i64
```

_Undocumented._

### `newProblem`

```milo
pub fn newProblem(nvars: i64): SmtProblem
```

Every variable an integer — the QF_LIA case this solver was written for.

### `newProblemMixed`

```milo
pub fn newProblemMixed(nvars: i64, varIsInt: Vec<bool>): SmtProblem
```

varIsInt[j] = false marks x_j as ranging over the reals, which disables the integer
tightenings for every row that mentions it. Feasibility, and therefore a `Proven`
verdict, is decided over the rationals either way, so this only ever loses precision.

### `nNot`

```milo
pub fn nNot(p: &mut SmtProblem, kid: i64): i64
```

_Undocumented._

### `nOr`

```milo
pub fn nOr(p: &mut SmtProblem, kids: Vec<i64>): i64
```

_Undocumented._

### `reduceConstraint`

```milo
pub fn reduceConstraint(c: &Constraint, allInt: bool): Constraint
```

Put a row in INTEGER normal form. Two steps, both exact over the integers — the
tightened row has the same integer solutions as the original, so this can only sharpen
a verdict, never invent one.

  1. Strictness goes away. `L < 0` on an integer L is `L + 1 <= 0`, so nothing
     downstream has to carry a strict flag.
  2. The constant is rounded IN. With g = gcd of the coefficients, `row·x` is always a
     multiple of g, so `g*(b·x) <= -konst` is `b·x <= floor(-konst/g)` — a strictly
     stronger bound than the rational one whenever g does not divide konst.

Step 2 is the whole reason this exists. Fourier-Motzkin decides feasibility over the
RATIONALS, so `2x = 3` looks satisfiable (x = 3/2) and the verdict came back `unknown —
no integer witness`: the solver could neither refute it nor produce a counterexample an
i64 could take. Rounding the bound in turns that same system into `x <= 1` and `x >= 2`,
which Fourier-Motzkin then refutes with no notion of integrality at all.

The old form divided coefficients AND konst by their common gcd, which is exact over the
rationals and therefore threw this away: gcd(2, 3) is 1, so `2x - 3 <= 0` did not move.

It also still does the job it was written for — dividing out the gcd bounds
Fourier-Motzkin's coefficient growth, which is what keeps i64 from overflowing on the
small systems contracts produce.

Both steps assume every variable the row mentions is an integer, which is what `allInt`
asserts. When it is false the row is only normalized in ways that hold over the reals:
strictness is preserved, and the gcd is divided out only when it divides the constant
exactly. See the SmtProblem comment for the false proof the guard prevents.

### `reduceRational`

```milo
pub fn reduceRational(c: &Constraint): Constraint
```

Normalize a row that mentions at least one real-valued variable. Dividing an inequality
through by a positive constant is exact over the rationals, so the gcd division survives
— but only when g divides konst too, since a fractional constant has nowhere to live in
an i64 row. Strictness is carried, not folded away: `L < 0` says nothing about `L + 1`
when L is real. When the gcd does not divide the constant the row is returned unchanged,
which costs some of Fourier-Motzkin's coefficient-growth headroom and nothing else.

### `rowAllInt`

```milo
pub fn rowAllInt(coeffs: &Vec<i64>, varIsInt: &Vec<bool>): bool
```

_Undocumented._

### `satisfiesAll`

```milo
pub fn satisfiesAll(cs: &Vec<Constraint>, x: &Vec<i64>): bool
```

_Undocumented._

### `verdictName`

```milo
pub fn verdictName(v: &Verdict): string
```

Decide SAT of the formula rooted at `root`. In a proof obligation the root is
(assumptions ∧ body-paths ∧ ¬goal), so:
  Proven      = UNSAT (no assignment yields a feasible conjunction)
  Violated(w) = SAT with a concrete integer counterexample w
  Unknown     = rational-feasible but no integer witness in the search box
                (the QF_LIA integer gap this Tier-1 core doesn't close)

The witness search enumerates integer points even for a real-valued variable. That is
sound in the direction it matters — an integer point is a real point, so a witness it
finds is a genuine counterexample — but incomplete: `0 < x && x < 1` is satisfiable over
the reals with no integer point at all, so the verdict is Unknown rather than Violated.

### `witnessBound`

```milo
pub fn witnessBound(nvars: i64): i64
```

Per-variable box radius so the total search (2b+1)^nvars stays near a few
million points — wide in low dimensions, tight in high ones.

### `zigzag`

```milo
pub fn zigzag(step: i64): i64
```

Map an odometer step 0,1,2,3,4,... to values 0,-1,1,-2,2,... so the search
fans out from the origin and returns small-magnitude witnesses (a clean
counterexample like x=-1, not the box corner x=-700).

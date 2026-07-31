// Verification condition generator — produces SMT-LIB2 from contract annotations
// and symbolically executes function bodies to prove postconditions.
import type { Program, Function, Contract, Expr, Stmt, MiloType } from "./ast";

export interface VerificationCondition {
  fn: string;
  kind: "precondition" | "postcondition" | "loop-invariant" | "termination" | "struct-invariant";
  smtlib: string;
  description: string;
  // Callees whose `ensures` this VC was allowed to ASSUME. Modular verification is
  // assume-guarantee: a proof here is only as good as those callees' own postcondition
  // proofs, and if one of them came back `unknown` this "proven" rests on something
  // nothing checked. Reported rather than silently trusted — see conditionalProofs.
  assumes?: string[];
  // Struct types whose `invariant` this VC was allowed to ASSUME, and — on a
  // struct-invariant VC — the type it is discharging FOR. Same assume-guarantee bookkeeping
  // as `assumes`: an invariant is in force at every use site, so a use-site proof is only as
  // good as the construction and maintenance obligations for that type.
  assumesInvariants?: string[];
  invariantOf?: string;
}

export interface VerifyResult {
  conditions: VerificationCondition[];
  stats: { functions: number; contracts: number; loops: number };
}

// Module-level immutable constants (top-level `let`), resolved once per run so
// contract expressions that reference them (e.g. `idx & VRAM_MASK`) translate to
// concrete SMT literals instead of leaking an undeclared symbol to the solver.
let GLOBAL_CONST_SMT = new Map<string, string>(); // name -> SMT literal string
let GLOBAL_CONST_NUM = new Map<string, bigint>();  // name -> numeric value

// A call inside a body or contract can't be inlined (the callee may be recursive, and
// unfolding is unbounded anyway), so each call site becomes one fresh constant standing
// for that single invocation, constrained by the callee's `ensures` — standard modular
// verification. Without this a call reached the solver as an undeclared symbol and z3
// rejected the entire query instead of returning a verdict.
//
// For a self-recursive call this is induction, which is only sound if the recursion
// terminates. Milo has no termination checker (no `decreases` clause), so a proof
// involving recursion is conditional on termination.
interface CallModel {
  ensuresByFn: Map<string, Function>;
  decls: string[];
  assumes: string[];
  n: number;
  // Every symbol the enclosing function's VCs declare. A callee contract may mention names
  // that exist only in the callee (a local, a field of its own receiver); substituting its
  // parameters does not remove those, and emitting them here would put an undeclared
  // symbol back in the query — the exact failure this call model exists to prevent.
  scope: Set<string>;
  // A body is lowered more than once per function (once for call-site obligations, once
  // per postcondition), so key on the AST node: the same call site must map to the same
  // constant. Two textually identical call sites are deliberately NOT shared — a Milo fn
  // may read mutable state, so assuming f(x) == f(x) across invocations could prove
  // something false.
  // Keyed by arg strings too: the same site lowered in two different states (loop entry vs
  // havoced body) must not reuse a constant whose assumption was built from the other
  // state's arguments — that would assume a fact about the wrong values.
  bySite: WeakMap<object, Map<string, string>>;
  // The exception to the no-sharing rule above: a `@pure` callee with no `&mut` parameter
  // is a function of its arguments alone, so `f(x)` denotes one value no matter how many
  // times it is written. Keyed by name + argument terms, and *not* by site.
  byPureKey: Map<string, string>;
  // Callee names whose postconditions were assumed while building this function's VCs.
  assumed: Set<string>;
}

// Scalar sorts the SMT translation models exactly. `miloTypeToSmt` falls back to `Int` for
// anything else, which is fine for a symbol constrained by an `ensures` (the constraint is
// what carries meaning) but not for an unconstrained one invented purely to be shared —
// an `Int` standing in for a struct would let the solver equate values that are not equal.
const SCALAR_RET = new Set(["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "bool"]);
let CALL_MODEL: CallModel | null = null;

// Placeholder line in a VC's SMT-LIB, replaced with this function's accumulated call
// declarations once every VC for the function has been built. Needed because call sites
// are discovered while lowering bodies, which happens after the declaration block is
// assembled. Left as-is it is an SMT comment, so a missed substitution is inert.
const CALL_MODEL_SLOT = "; (call model)";

// SMT-LIB operators and literals that are not symbols needing a declaration.
const SMT_BUILTINS = new Set([
  "and", "or", "not", "=>", "=", "distinct", "ite", "true", "false",
  "div", "mod", "abs", "to_real", "to_int", "let", "-", "+", "*", "/",
  "<", ">", "<=", ">=",
]);

// Every free symbol in `smt` must already be declared in the enclosing function's query.
// FIELD_REFS counts: it is the set the declaration block is built from, and it is still
// open at this point — a callee's `ensures result.len == 16` rebases to a fresh
// `genKey__ret0_len` that gets declared alongside the others.
function symbolsResolve(smt: string, ctx: CallModel, extra?: string): boolean {
  for (const m of smt.matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)) {
    const sym = m[0];
    if (SMT_BUILTINS.has(sym)) continue;
    if (ctx.scope.has(sym)) continue;
    if (FIELD_REFS?.has(sym)) continue;
    if (sym === extra) continue;
    return false;
  }
  return true;
}

function modelCall(site: object, name: string, args: Expr[], env?: Map<string, string>): string | null {
  const ctx = CALL_MODEL;
  if (!ctx) return null;
  // A `@pure` callee with no `&mut` parameter depends on nothing but its arguments, so a
  // shared unconstrained constant is sound even with no contract to describe it: it says
  // only "this call has some fixed value", which is true. That is what lets `f(x) == f(x)`
  // be assumed, and it is why the bail-outs below are relaxed for such a callee.
  const functional = PURE_FN_NAMES.has(name) && SCALAR_RET.has(FN_TABLE.get(name)?.retType?.name ?? "");
  const callee = ctx.ensuresByFn.get(name) ?? (functional ? FN_TABLE.get(name) : undefined);
  // No contract to constrain the return value: for an impure callee an unconstrained fresh
  // constant would let the solver "violate" a postcondition using a return value the callee
  // can never produce. Report unknown rather than a counterexample the user can't reproduce.
  if (!callee || callee.params.length !== args.length) return null;
  const ensures = callee.contracts.filter(c => c.kind === "ensures");
  if (ensures.length === 0 && !functional) return null;
  // A postcondition about what the callee WROTE through a `&mut` cannot be modelled HERE:
  // the caller's post-call symbol for that argument is minted later, by the havoc. Assuming
  // it under the pre-call substitution would assert something false — see the note above.
  // Those clauses are dropped from the return-value model and picked up instead by the frame
  // assumption emitted at the call statement, which has both states in hand.
  const mutParams = new Set(callee.params.filter(p => p.type?.isRefMut || p.type?.isPtr).map(p => p.name));
  const usableEnsures = mutParams.size === 0
    ? ensures
    : ensures.filter(e => !mentionsMutParamPostState(e.expr, mutParams));
  if (usableEnsures.length === 0 && !functional) return null;

  // Lowered IN THE CALLER'S ENVIRONMENT. Without it every argument naming a local came out
  // as a bare undeclared symbol, the whole model was rejected below, and the call degraded
  // to an unknown — so `let b = clamp(end, len)` left `b` untranslatable and the loop guard
  // built from it silently vanished from the invariant's preservation query.
  const argSmt = args.map(a => (env ? exprToSmtWithEnv(a, env) : exprToSmt(a)));
  if (argSmt.some(a => /UNSUPPORTED/.test(a))) return null;
  const siteKey = argSmt.join(",");
  const pureKey = functional ? `${name}(${siteKey})` : null;
  if (pureKey) {
    const shared = ctx.byPureKey.get(pureKey);
    if (shared) return shared;
  }
  const cached = ctx.bySite.get(site)?.get(siteKey);
  if (cached) return cached;
  // The declaration block is shared by every VC of the enclosing function, but `result`
  // is only declared in postcondition VCs — an assumption mentioning it would leak an
  // undeclared symbol into the precondition ones.
  if (argSmt.some(a => /\bresult\b/.test(a))) return null;

  const retName = `${name}__ret${ctx.n++}`;
  const retType = callee.retType?.name ?? "i64";
  const subst = env ? new Map(fieldBindings(callee.params, args, env)) : new Map<string, string>();
  callee.params.forEach((p, i) => subst.set(p.name, argSmt[i]!));
  subst.set("result", retName);
  const facts = usableEnsures
    .map(e => exprToSmtWithEnv(e.expr, subst, true))
    .filter(s => !/UNSUPPORTED/.test(s));
  // Nothing sayable about the value. For a functional callee that is still worth a symbol —
  // shared across sites, it carries `f(x) == f(x)` and nothing else, which is exactly the
  // guarantee `@pure` provides. For anyone else it is the unconstrained-unknown trap.
  if (facts.length === 0) {
    if (!pureKey) return null;
    ctx.decls.push(declareConst(retName, retType));
    const r = intRangeAssumption(retName, retType);
    if (r) ctx.assumes.push(r);
    ctx.scope.add(retName);
    ctx.byPureKey.set(pureKey, retName);
    return retName;
  }

  // A callee only guarantees its `ensures` when its `requires` were met, so what may be
  // assumed here is the implication, never the bare postcondition. Assuming the bare form
  // is circular: discharging `lo <= hi` at a call to clamp would get to assume clamp's
  // `lo <= result <= hi`, which entails `lo <= hi` — the obligation proves itself.
  const guards = callee.contracts
    .filter(c => c.kind === "requires")
    .map(c => exprToSmtWithEnv(c.expr, subst, true));
  // An untranslatable `requires` can't be stated as the implication's antecedent, and
  // dropping it would silently restore the circular form.
  if (guards.some(g => /UNSUPPORTED/.test(g))) return null;

  // `retName` is declared unconditionally a few lines below, but it is not in ctx.scope
  // yet — and it is the one symbol a callee's `ensures result ...` is guaranteed to
  // mention. Checking without it rejected EVERY scalar-returning callee's postcondition,
  // silently: the model was dropped, the call became an unconstrained unknown, and loop
  // guards built from it turned into UNSUPPORTED. It is passed as an allowance rather
  // than added to the scope so that bailing out below cannot leave a scope entry with no
  // matching declaration.
  if (![...facts, ...guards].every(s => symbolsResolve(s, ctx, retName))) return null;

  const conclusion = facts.length === 1 ? facts[0]! : `(and ${facts.join(" ")})`;
  const antecedent = guards.length === 0
    ? null
    : guards.length === 1 ? guards[0]! : `(and ${guards.join(" ")})`;

  ctx.decls.push(declareConst(retName, retType));
  const range = intRangeAssumption(retName, retType);
  if (range) ctx.assumes.push(range);
  ctx.assumes.push(`(assert ${antecedent ? `(=> ${antecedent} ${conclusion})` : conclusion})`);
  ctx.assumed.add(name);    // this VC now leans on `name`'s postcondition being true
  ctx.scope.add(retName);   // a later call may take this one's result as an argument
  const perSite = ctx.bySite.get(site) ?? new Map<string, string>();
  perSite.set(siteKey, retName);
  ctx.bySite.set(site, perSite);
  if (pureKey) ctx.byPureKey.set(pureKey, retName);
  return retName;
}

// Splice the accumulated call declarations into every VC built for one function. Runs
// even when nothing was modelled, so the placeholder never survives into emitted SMT.
function fillCallModel(conditions: VerificationCondition[], from: number) {
  const ctx = CALL_MODEL;
  if (!ctx) return;
  const block = [...ctx.decls, ...ctx.assumes].join("\n");
  const assumed = [...ctx.assumed];
  for (let i = from; i < conditions.length; i++) {
    conditions[i]!.smtlib = block
      ? conditions[i]!.smtlib.replace(CALL_MODEL_SLOT, block)
      : conditions[i]!.smtlib.replace(`${CALL_MODEL_SLOT}\n`, "");
    if (assumed.length) conditions[i]!.assumes = assumed;
  }
}

// Fold a constant expression (int literals, const globals, const arithmetic) to
// a number, or null if it isn't statically constant. Used to recognise shift
// amounts and power-of-two masks in the bitwise lowering below.
function resolveConstNum(expr: Expr): bigint | null {
  if (!expr) return null;
  if (expr.kind === "IntLit") return BigInt(expr.value);
  if (expr.kind === "Ident") return GLOBAL_CONST_NUM.get(expr.name) ?? null;
  if (expr.kind === "UnaryOp" && expr.op === "-") {
    const v = resolveConstNum(expr.operand); return v === null ? null : -v;
  }
  if (expr.kind === "CastExpr") return resolveConstNum(expr.operand);
  if (expr.kind === "BinOp") {
    const l = resolveConstNum(expr.left), r = resolveConstNum(expr.right);
    if (l === null || r === null) return null;
    switch (expr.op) {
      case "+": return l + r; case "-": return l - r; case "*": return l * r;
      case "<<": return l << r; case ">>": return l >> r;
      case "&": return l & r; case "|": return l | r; case "^": return l ^ r;
      case "/": return r === 0n ? null : l / r; case "%": return r === 0n ? null : l % r;
    }
  }
  return null;
}

function numToSmt(n: bigint): string {
  return n < 0n ? `(- ${-n})` : n.toString();
}

// An integer cast: unsigned narrowing is exact modular truncation; widening and
// i64/u64 are value-preserving in our unbounded-Int model, so identity.
function castToSmt(operandStr: string, targetName: string): string {
  const toFloat = targetName === "f32" || targetName === "f64";
  if (toFloat) {
    // Widening an integer is exact, so the cast is just a sort change. Float-to-float is
    // a no-op in this model (no rounding notion), which is why f32 narrowing is not
    // distinguished — the same unbounded-precision assumption the Int model already makes.
    return isRealSmt(operandStr) ? operandStr : `(to_real ${operandStr})`;
  }
  // The reverse direction is not a sort change to paper over: Milo's float-to-int cast
  // truncates toward zero and SMT-LIB's `to_int` is a floor, so they disagree on every
  // negative value. Truncation IS floor on the magnitude, so spell it that way rather than
  // emitting a `to_int` that models a cast the program does not perform.
  const intOperand = isRealSmt(operandStr)
    ? `(ite (>= ${operandStr} 0.0) (to_int ${operandStr}) (- (to_int (- ${operandStr}))))`
    : operandStr;
  switch (targetName) {
    case "u8": return `(mod ${intOperand} 256)`;
    case "u16": return `(mod ${intOperand} 65536)`;
    case "u32": return `(mod ${intOperand} 4294967296)`;
    default: return intOperand;
  }
}

// SMT symbols this function's query declares with sort Real. Reset per function, because
// the same Milo name is an i64 in one function and an f64 in the next, and misreading the
// sort picks the wrong division operator.
let REAL_SYMS = new Set<string>();
let NONREAL_SYMS = new Set<string>();

function declareConst(name: string, typeName: string | undefined): string {
  const sort = miloTypeToSmt(typeName ?? "i64");
  (sort === "Real" ? REAL_SYMS : NONREAL_SYMS).add(name);
  return `(declare-const ${name} ${sort})`;
}

// Is an already-emitted term real-sorted? Only the leaves matter: every arithmetic operator
// here is sort-preserving, so a term is Real exactly when it mentions a Real symbol or a
// decimal literal.
//
// A declared sort always wins. The FLOAT_FIELDS fallback is for the field paths lowering
// invents after the declaration block is assembled (`c__mut2_vx` and friends) — same rule
// fieldSort will apply to them, applied early. It is gated on the symbol looking like a
// flattened path at all, so an ordinary parameter cannot be mistaken for a struct field
// that happens to share its name.
function isRealSmt(s: string): boolean {
  for (const t of s.split(/[\s()]+/)) {
    if (!t) continue;
    if (/^\d+\.\d+$/.test(t)) return true;
    if (NONREAL_SYMS.has(t)) continue;
    if (REAL_SYMS.has(t)) return true;
    if (t.includes("_") && FLOAT_FIELDS.has(t.slice(t.lastIndexOf("_") + 1))) return true;
  }
  return false;
}

// A float literal as an SMT-LIB decimal. Anything JS renders in exponent form (1e21, and
// the infinities/NaN a constant fold could produce) has no decimal spelling, so it stays
// untranslated rather than being emitted as something the solver would read differently.
function floatLitToSmt(v: number): string {
  if (!Number.isFinite(v)) return `(UNSUPPORTED FloatLit)`;
  const mag = Math.abs(v);
  const s = Number.isInteger(mag) ? mag.toFixed(1) : String(mag);
  if (!/^\d+\.\d+$/.test(s)) return `(UNSUPPORTED FloatLit)`;
  return v < 0 ? `(- ${s})` : s;
}

// `/` is truncating integer division on ints and exact division on floats — one Milo
// operator, two SMT operators, told apart by the operand sorts.
function realDivToSmt(op: string, left: string, right: string): string | null {
  if (op !== "/") return null;
  if (!isRealSmt(left) && !isRealSmt(right)) return null;
  return `(/ ${left} ${right})`;
}

// Bitwise/shift with a constant operand lowered to linear/nonlinear integer
// arithmetic: `x << k` = x*2^k, `x >> k` = x div 2^k, and `x & (2^k-1)` = x mod
// 2^k (exact for the unsigned masking idiom). Returns null when the pattern
// isn't a constant shift/pow2-mask, so the caller falls back to the generic op.
function bitOpToSmt(op: string, leftStr: string, rightExpr: Expr): string | null {
  const c = resolveConstNum(rightExpr);
  if (c === null || c < 0n) return null;
  if (op === "<<") return `(* ${leftStr} ${numToSmt(1n << c)})`;
  if (op === ">>") return `(div ${leftStr} ${numToSmt(1n << c)})`;
  if (op === "&" && (c & (c + 1n)) === 0n) return `(mod ${leftStr} ${numToSmt(c + 1n)})`;
  // Single-bit test: `x & 0x80`. Distinct from the mask case above (0x80 is not 2^k-1), and
  // far more common — every CPU flag check in an emulator is one. Extracting bit k as
  // `2^k * ((x div 2^k) mod 2)` stays linear, and floor/Euclidean semantics give the right
  // answer for negative x too, since those are the two's-complement bits.
  if (op === "&" && c > 0n && (c & (c - 1n)) === 0n) {
    const p2 = numToSmt(c);
    return `(* ${p2} (mod (div ${leftStr} ${p2}) 2))`;
  }

  // SMT-LIB `div`/`mod` are EUCLIDEAN — the remainder is never negative, so -7 mod 3 is 2.
  // Milo's `/` and `%` truncate toward zero like C, so -7 % 3 is -1. Lowering one to the
  // other was a FALSE PROOF: `ensures result == 2` on `a % 3` with `a == -7` came back
  // proven for a function that returns -1.
  //
  // Truncation is rebuilt out of floor division, which agrees with truncation on
  // non-negative operands: trunc(a/b) = a >= 0 ? floor(a/|b|) : -floor(-a/|b|), negated
  // again when the divisor is negative. The remainder follows from `a - b*q`, which stays
  // linear because `b` is a literal here. A NON-constant divisor gets no rule at all (see
  // binOpToSmt) rather than the wrong one — unknown beats a plausible lie.
  return null;
}

// Truncating `/` and `%`, for any divisor. SMT-LIB `div`/`mod` are EUCLIDEAN — the
// remainder is never negative, so -7 mod 3 is 2 — while Milo truncates toward zero like C
// and gives -1. Lowering one onto the other was a false proof: `ensures result == 2` on
// `a % 3` came back proven for a function returning -1.
//
// Truncation is rebuilt from floor division, which agrees with truncation whenever the
// operands are non-negative, so each sign quadrant is handled explicitly. A constant
// divisor keeps the whole thing linear; a symbolic one leaves `(* b q)` in the remainder,
// which z3 can often still decide and the native linear solver reports unknown for.
function truncDivToSmt(op: string, leftStr: string, rightStr: string, rightConst: bigint | null): string | null {
  if (rightConst === 0n) return null;   // division by zero: no meaning to model
  const neg = (x: string) => `(- ${x})`;
  if (rightConst !== null) {
    const mag = numToSmt(rightConst < 0n ? -rightConst : rightConst);
    let q = `(ite (>= ${leftStr} 0) (div ${leftStr} ${mag}) ${neg(`(div ${neg(leftStr)} ${mag})`)})`;
    if (rightConst < 0n) q = neg(q);
    return op === "/" ? q : `(- ${leftStr} (* ${numToSmt(rightConst)} ${q}))`;
  }
  // Symbolic divisor: four quadrants, each reduced to floor division on non-negatives.
  const q =
    `(ite (>= ${leftStr} 0)` +
    ` (ite (> ${rightStr} 0) (div ${leftStr} ${rightStr}) ${neg(`(div ${leftStr} ${neg(rightStr)})`)})` +
    ` (ite (> ${rightStr} 0) ${neg(`(div ${neg(leftStr)} ${rightStr})`)} (div ${neg(leftStr)} ${neg(rightStr)})))`;
  return op === "/" ? q : `(- ${leftStr} (* ${rightStr} ${q}))`;
}

// Every variable a statement list assigns to, including through nested control flow.
// A loop's effect on the environment is unbounded, so these are the names that have to be
// replaced by fresh unknowns (havoc) before execution can continue past it.
function collectAssignedVars(stmts: Stmt[], out: Set<string>): void {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case "Assign":
        if (stmt.target.kind === "Ident") out.add(stmt.target.name);
        else if (stmt.target.kind === "FieldAccess") {
          const flat = flattenFieldAccess(stmt.target);
          if (flat) out.add(flat);
        }
        break;
      case "IfStmt":
        collectAssignedVars(stmt.thenBody, out);
        if (stmt.elseBody) collectAssignedVars(stmt.elseBody, out);
        break;
      case "IfLetStmt":
        collectAssignedVars(stmt.thenBody, out);
        if (stmt.elseBody) collectAssignedVars(stmt.elseBody, out);
        break;
      case "WhileStmt": collectAssignedVars(stmt.body, out); break;
      case "ForInStmt": collectAssignedVars(stmt.body, out); break;
      case "UnsafeBlock": collectAssignedVars(stmt.body, out); break;
      case "LetElseStmt": collectAssignedVars(stmt.elseBody, out); break;
      case "MatchStmt":
        for (const arm of stmt.arms) collectAssignedVars(arm.body, out);
        break;
    }
  }
}

// A loop that needs establishment/preservation obligations proved, captured while walking
// the enclosing body so both are stated in the environment that actually reaches the loop.
interface LoopObligation {
  entryConds: string[];             // path conditions holding at loop entry
  entryEnv: Map<string, string>;    // environment at loop entry, for establishment
  havocEnv: Map<string, string>;    // entry env with modified vars replaced by fresh consts
  guard: string;                    // loop condition, lowered in havocEnv
  invariants: Contract[];
  variants: Contract[];             // `decreases` measures — termination, not correctness
  body: Stmt[];
  bodyRun: SymExecResult;
  // A for-in loop has no assignment that advances its binding, so the post-iteration state
  // is the body's final environment with this patch applied on top (`i` → `i + 1` for a
  // counted loop). Absent for a while loop, whose body does its own advancing.
  nextPatch?: Map<string, string>;
}

// Symbolic path through a function body
interface SymPath {
  conditions: string[];  // path conditions as SMT expressions
  result: string;        // return value expression
  // State at the `return`. A postcondition names the state at exit, so `ensures n == 100`
  // on a `&mut` parameter has to read the value the path left behind, not the one it
  // started with — and `old(n)` reads the entry environment instead.
  env: Map<string, string>;
}

// A struct literal reached during symbolic execution: where its type's `invariant` clauses
// have to be discharged, since this is the point the value comes into existence.
interface StructLitSite {
  struct: string;
  fields: Map<string, string>;   // field name -> value, lowered in the env at the literal
  conditions: string[];
}

// Collect all execution paths through a function body via symbolic execution.
// Handles if/else chains and early returns — the common pattern in contract-bearing functions.
interface SymExecResult {
  paths: SymPath[];
  finalEnvs: { conditions: string[]; env: Map<string, string> }[];
  breakEnvs: { conditions: string[]; env: Map<string, string> }[];
  continueEnvs: { conditions: string[]; env: Map<string, string> }[];
  calls: CallSite[];
  // Fresh constants introduced by havoc, to be spliced into the function's declaration
  // block — path conditions reference them, so an undeclared one poisons every VC.
  havocDecls: string[];
  loops: LoopObligation[];
  structLits: StructLitSite[];
}

interface SymExecContext {
  havocSeq: number;
  havocDecls: string[];
}

// A call reached during symbolic execution, with the path conditions that hold when it
// runs. Used to prove the caller actually satisfies the callee's `requires` — without the
// conditions, `if x >= 0 { g(x) }` would be reported as a violation of g's `requires
// x >= 0`, and a prover that cries wolf is one people stop running.
interface CallSite {
  name: string;
  args: string[];        // already lowered to SMT in the caller's environment
  // Flattened field symbols of any struct argument, in the callee's naming. See fieldBindings.
  fields: Map<string, string>;
  conditions: string[];
}

// Every struct literal reachable from an expression. A literal is where a type's invariant
// stops being an assumption and becomes an obligation: everything downstream gets to assume
// it, so something has to establish it, and construction is that something.
function collectStructLitsInExpr(expr: Expr, conds: string[], env: Map<string, string>, out: StructLitSite[]): void {
  if (!expr || typeof expr !== "object") return;
  const e = expr as any;
  if (e.kind === "StructLit" && typeof e.name === "string" && STRUCT_INVARIANTS.has(e.name)) {
    const fields = new Map<string, string>();
    for (const f of e.fields ?? []) fields.set(f.name, exprToSmtWithEnv(f.value, env));
    out.push({ struct: e.name, fields, conditions: [...conds] });
  }
  for (const v of Object.values(e)) {
    if (Array.isArray(v)) v.forEach(x => { if (x && (x as any).kind) collectStructLitsInExpr(x as Expr, conds, env, out); else if (x && (x as any).value?.kind) collectStructLitsInExpr((x as any).value, conds, env, out); });
    else if (v && typeof v === "object" && (v as any).kind) collectStructLitsInExpr(v as Expr, conds, env, out);
  }
}

// Every call reachable from an expression, paired with the conditions in force. Only
// direct calls to named fns matter — that is all a `requires` can hang off.
function collectCallsInExpr(expr: Expr, conds: string[], env: Map<string, string>, out: CallSite[]): void {
  if (!expr) return;
  const e = expr as any;
  if (e.kind === "Call" && typeof e.func === "string") {
    const callee = FN_TABLE.get(e.func);
    out.push({
      name: e.func,
      args: (e.args ?? []).map((a: Expr) => exprToSmtWithEnv(a, env)),
      fields: callee ? fieldBindings(callee.params, e.args ?? [], env) : new Map(),
      conditions: [...conds],
    });
  }
  for (const key of ["left", "right", "operand", "object", "index", "cond", "value", "start", "end", "default"]) {
    if (e[key] && typeof e[key] === "object" && e[key].kind) collectCallsInExpr(e[key], conds, env, out);
  }
  for (const key of ["args", "elements"]) {
    if (Array.isArray(e[key])) for (const a of e[key]) if (a && a.kind) collectCallsInExpr(a, conds, env, out);
  }
}

// A static/associated method call `Type.method(args)` parses as an EnumLit (the parser
// can't tell `Math.clampI64(..)` from an enum construction). The whole VC machinery keys
// off `Call` nodes with a string `func`, so rewrite every EnumLit that names a known impl
// method into `Call{func:"Type.method"}` in place — after this pass a namespaced stdlib
// call is indistinguishable from the free function it replaced, and call collection,
// call-site obligations, and postcondition modelling all work unchanged. `implKeys` is the
// set of `${typeName}.${method}`; enum-variant keys are excluded by the caller so a real
// construction that happens to share a name is never rewritten.
function rewriteStaticCalls(node: any, implKeys: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const x of node) rewriteStaticCalls(x, implKeys); return; }
  if (node.kind === "EnumLit" && typeof node.enumName === "string" && typeof node.variant === "string"
      && implKeys.has(`${node.enumName}.${node.variant}`)) {
    const func = `${node.enumName}.${node.variant}`;
    const args = node.args ?? [];
    for (const k of Object.keys(node)) delete node[k];
    node.kind = "Call";
    node.func = func;
    node.args = args;
    rewriteStaticCalls(args, implKeys);
    return;
  }
  for (const k of Object.keys(node)) {
    if (k === "span") continue;
    rewriteStaticCalls(node[k], implKeys);
  }
}

// Every function in the program, for looking up a callee's parameter modes. Set once per
// run alongside GLOBAL_CONST_*.
let FN_TABLE = new Map<string, Function>();

// Functions that provably mutate nothing: `@pure` (checker-enforced — no globals, no
// unsafe, no I/O, no impure callee) AND no `&mut`/pointer parameter to write through.
// A call to one cannot invalidate anything the walker knows, so it needs no havoc.
// `PURE_METHOD_NAMES` is keyed by the bare method name because a `MethodCall` node
// carries no receiver type here; a name is admitted only when EVERY impl method with
// that name qualifies, so an impure `Foo.reset` keeps `bar.reset()` conservative.
let PURE_FN_NAMES = new Set<string>();
let PURE_METHOD_NAMES = new Set<string>();

function mutatesNothing(f: Function): boolean {
  return !!f.attributes?.some(a => a.name === "pure")
    && !f.params.some(p => (p.type as any)?.isRefMut || (p.type as any)?.isPtr);
}

// `invariant` clauses per struct name, and the field list to instantiate them over. Set
// once per run: an invariant is a property of the TYPE, so it is in force at every use.
let STRUCT_INVARIANTS = new Map<string, Contract[]>();
let STRUCT_FIELDS = new Map<string, string[]>();

// The environment as it stood at function entry, which is what `old(e)` reads. Scoped to
// one function's VC build, like FIELD_REFS.
let OLD_ENV: Map<string, string> | null = null;

// Does an expression name any of these identifiers? Used to decide whether a loop
// invariant survives past the loop, where the bindings it named no longer exist.
function mentionsAnyIdent(expr: Expr, names: Set<string>): boolean {
  if (!expr || typeof expr !== "object" || names.size === 0) return false;
  const e = expr as any;
  if (e.kind === "Ident") return names.has(e.name);
  for (const v of Object.values(e)) {
    if (Array.isArray(v)) { if (v.some(x => x && (x as any).kind && mentionsAnyIdent(x as Expr, names))) return true; }
    else if (v && typeof v === "object" && (v as any).kind && mentionsAnyIdent(v as Expr, names)) return true;
  }
  return false;
}

function isOldCall(expr: any): boolean {
  return expr && expr.kind === "Call" && expr.func === "old" && Array.isArray(expr.args) && expr.args.length === 1;
}

// A struct invariant is written over bare field names (`chr.len > 0`). Binding each field
// name to the symbol standing for that field of a particular value is the whole
// instantiation: `chr` -> `ppu_chr` makes `chr.len` rebase to `ppu_chr_len`.
function instantiateInvariant(inv: Contract, fieldEnv: Map<string, string>): string {
  return exprToSmtWithEnv(inv.expr, fieldEnv, true);
}

// Does a callee's `ensures` talk about the FINAL value of a parameter it can write through?
// Such a clause cannot be modelled by substituting the caller's arguments: the arguments are
// the pre-call values, so `ensures n == 100` on `fn set(n: &mut i64)` would come back as the
// assumption `<arg> == 100` about the value BEFORE the call. For `set(x)` with `x == 5` that
// assumption is false, and a false assumption proves every postcondition in the function.
// `old(n)` is exempt — that is exactly the pre-call value the substitution provides.
function mentionsMutParamPostState(expr: Expr, mutParams: Set<string>): boolean {
  if (!expr || typeof expr !== "object") return false;
  const e = expr as any;
  if (isOldCall(e)) return false;
  if (e.kind === "Ident") return mutParams.has(e.name);
  for (const v of Object.values(e)) {
    if (Array.isArray(v)) { if (v.some(x => x && (x as any).kind && mentionsMutParamPostState(x as Expr, mutParams))) return true; }
    else if (v && typeof v === "object" && (v as any).kind && mentionsMutParamPostState(v as Expr, mutParams)) return true;
  }
  return false;
}

// Field names whose declared type is `bool` in EVERY struct that has them. Field symbols
// are flattened to `recv_field` with no record of which struct the receiver was, so the
// sort has to come from the name — and only when it is unambiguous across the program.
//
// Getting it wrong emits an invalid query rather than a wrong answer: `ppu.mirrorVertical`
// declared as `Int` produced `(and ppu_mirrorVertical ...)` and z3 rejected the VC with
// "Sort mismatch at argument #1 for function (declare-fun and (Bool Bool) Bool)". Same
// class as an unannotated `var matched = true`, one level out.
let BOOL_FIELDS = new Set<string>();

// Same idea one sort over, and it is a soundness guard rather than a validity one: a float
// field left as `Int` is not rejected by z3 — it silently coerces — and std/smt would then
// apply its integer tightenings to a value that can sit between two integers. That is the
// false proof the SmtProblem comment describes, reached through a struct field instead of a
// parameter. It only became reachable when float literals started translating.
let FLOAT_FIELDS = new Set<string>();

function collectFieldsOfSort(program: Program, isSort: (t: any) => boolean): Set<string> {
  const matching = new Set<string>();
  const other = new Set<string>();
  for (const f of (program.structs ?? []).flatMap(st => st.fields as any[])) {
    (isSort(f.type) && !f.type?.isPtr && !f.type?.isArray ? matching : other).add(f.name);
  }
  for (const n of other) matching.delete(n);   // ambiguous across structs: leave it an Int
  return matching;
}

function collectBoolFields(program: Program): Set<string> {
  return collectFieldsOfSort(program, t => t?.name === "bool");
}

function collectFloatFields(program: Program): Set<string> {
  return collectFieldsOfSort(program, t => t?.name === "f32" || t?.name === "f64");
}

// Names in the function under analysis that a callee could actually write through: `var`
// locals and `&mut`/`*mut` parameters. Nothing else is a legal mutation target — `let` is
// an immutable binding and `&T` is an immutable borrow, both enforced by the checker — so
// havocing them would only throw away facts. Scoped per function, like FIELD_REFS.
let MUTABLE_NAMES = new Set<string>();

function collectMutableNames(fn: Function): Set<string> {
  const out = new Set<string>();
  for (const p of fn.params) if (p.type?.isRefMut || p.type?.isPtr) out.add(p.name);
  const scan = (stmts: Stmt[]): void => {
    for (const s of stmts as any[]) {
      if (s.kind === "VarDecl") out.add(s.name);
      for (const key of ["body", "thenBody", "elseBody"]) if (Array.isArray(s[key])) scan(s[key]);
      if (Array.isArray(s.arms)) for (const arm of s.arms) if (Array.isArray(arm.body)) scan(arm.body);
    }
  };
  scan(fn.body);
  return out;
}

// A call that writes through a `&mut` AND says something about the result in its `ensures`.
// Havocing the argument is what keeps the walker sound; this is what keeps it useful — the
// frame condition relating the post-call symbols back to the pre-call ones.
interface MutatingCall {
  callee: Function;
  args: Expr[];
  // callee parameter name -> caller-side base name it was passed. The frame substitution
  // needs both: the parameter is the name the contract is written in, the base is where the
  // post-call symbols live.
  mutTargets: Map<string, string>;
}

function collectMutatingCalls(node: any, out: MutatingCall[], seen = new Set<any>()): void {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (node.kind === "Call" && typeof node.func === "string" && Array.isArray(node.args)) {
    const callee = FN_TABLE.get(node.func);
    if (callee && callee.contracts.some(c => c.kind === "ensures") && callee.params.length === node.args.length) {
      const mutTargets = new Map<string, string>();
      callee.params.forEach((p, i) => {
        if (!p.type?.isRefMut && !p.type?.isPtr) return;
        const base = mutationBase(node.args[i]);
        if (base !== null && MUTABLE_NAMES.has(base)) mutTargets.set(p.name, base);
      });
      if (mutTargets.size > 0) out.push({ callee, args: node.args, mutTargets });
    }
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach(x => collectMutatingCalls(x, out, seen));
    else if (v && typeof v === "object") collectMutatingCalls(v, out, seen);
  }
}

// A struct argument is not one symbol on the caller side — each field it carries has its
// own. Binding the callee's flattened field prefixes to the caller's lets a contract written
// as `h.count.len` rebase onto `lencode_count_len` instead of leaking the callee's name.
// Without it, a `&Huff` parameter reached the solver as one opaque (often untranslatable)
// value and every precondition about one of its fields went unknown.
function fieldBindings(params: { name: string; type?: any }[], args: Expr[], env: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < params.length && i < args.length; i++) {
    const base = mutationBase(args[i]);
    if (base === null) continue;
    for (const f of FIELD_REFS ?? []) {
      if (!f.startsWith(`${base}_`)) continue;
      const bound = env.get(f);
      if (bound && /^[A-Za-z_][A-Za-z0-9_]*$/.test(bound)) out.set(`${params[i]!.name}${f.slice(base.length)}`, bound);
    }
  }
  return out;
}

function mutationBase(e: any): string | null {
  if (!e || typeof e !== "object") return null;
  if (e.kind === "Ident") return e.name;
  if (e.kind === "FieldAccess") return mutationBase(e.object);
  if (e.kind === "UnaryOp" && (e.op === "&" || e.op === "&mut")) return mutationBase(e.operand);
  return null;
}

// Names a statement can mutate WITHOUT an assignment appearing anywhere in it: passing a
// variable to a `&mut`/`*mut` parameter, or calling a method that takes `&mut self`.
//
// This was a FALSE PROOF, not a missed one. `fn bump(n: &mut i64)` called as `bump(x)`
// left the walker's binding for `x` at its pre-call value, so `var x = 0; bump(x); return x`
// PROVED `ensures result == 0` for a function that returns 100. Anything the walker cannot
// see through has to become an unknown, never a stale known.
//
// A method call havocs its receiver unconditionally: resolving which `impl` a method comes
// from (and whether it takes `&mut self`) needs the checker's tables, which are not
// available here. Over-havocking costs precision; under-havocking costs correctness.
function collectMutations(node: any, out: Set<string>, seen = new Set<any>()): void {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  const target = (e: any): string | null => {
    const n = base(e);
    return n !== null && MUTABLE_NAMES.has(n) ? n : null;
  };
  const base = (e: any): string | null => {
    if (!e || typeof e !== "object") return null;
    if (e.kind === "Ident") return e.name;
    if (e.kind === "FieldAccess") return base(e.object);
    if (e.kind === "UnaryOp" && (e.op === "&" || e.op === "&mut")) return base(e.operand);
    return null;
  };
  // The flattened path (`a_data`) when the receiver is a field of a mutable name; null when
  // it is not a plain place expression, so the caller can fall back to the whole receiver.
  const fieldPath = (e: any): string | null => {
    const root = base(e);
    if (root === null || !MUTABLE_NAMES.has(root)) return null;
    const flat = flattenFieldAccess(e as Expr);
    return flat;
  };
  if (node.kind === "Call" && typeof node.func === "string" && Array.isArray(node.args)) {
    const callee = FN_TABLE.get(node.func);
    if (PURE_FN_NAMES.has(node.func)) {
      // Nothing to havoc — but keep walking the arguments, which may themselves contain
      // calls that do mutate.
    } else if (callee) {
      callee.params.forEach((p, i) => {
        if (!p.type?.isRefMut && !p.type?.isPtr) return;
        const n = target(node.args[i]);
        if (n) out.add(n);
      });
    } else {
      // Unknown callee (function pointer, closure, unresolved): assume the worst.
      for (const a of node.args) { const n = target(a); if (n) out.add(n); }
    }
  }
  if (node.kind === "MethodCall" && !PURE_METHOD_NAMES.has(node.method)) {
    // Havoc the FIELD PATH the method was called on, not the whole receiver: `a.data.push(v)`
    // cannot touch `a.live`, and wiping every field of `a` made a type invariant about a
    // sibling field unprovable for every function that pushes to a vec — which is most of
    // them. The root itself still goes, since the aggregate value did change.
    const path = fieldPath(node.object);
    if (path !== null) out.add(path);
    else { const n = target(node.object); if (n) out.add(n); }
  }
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach(x => collectMutations(x, out, seen));
    else if (v && typeof v === "object") collectMutations(v, out, seen);
  }
}

// The declared type of an unannotated local, as far as its initializer reveals it. Only
// the SMT SORT matters here, so `bool` vs `i64` is the distinction that counts.
//
// Getting this wrong emits an invalid query, not a wrong answer: `var matched = true`
// havoced to an `Int` produced `(not matched__loop3)`, and z3 rejected the whole VC with
// "Sort mismatch at argument #1 for function (declare-fun not (Bool) Bool)". Found by
// running the gate over milojs, whose `jsIndexOf` is written that way.
function inferLiteralType(value: Expr | undefined): string | null {
  if (!value) return null;
  if (value.kind === "BoolLit") return "bool";
  if (value.kind === "FloatLit") return "f64";
  if (value.kind === "BinOp" && BOOL_OPS.has(value.op)) return "bool";
  if (value.kind === "UnaryOp" && value.op === "!") return "bool";
  return null;
}

const BOOL_OPS = new Set(["==", "!=", "<", ">", "<=", ">=", "&&", "||"]);

function collectPaths(stmts: Stmt[], env: Map<string, string>, types?: Map<string, string>, context?: SymExecContext): SymExecResult {
  const paths: SymPath[] = [];
  const calls: CallSite[] = [];
  const structLits: StructLitSite[] = [];
  const ctx = context ?? { havocSeq: 0, havocDecls: [] };
  const loops: LoopObligation[] = [];
  const varTypes = new Map(types ?? []);

  // Replace every variable the block assigns with a fresh constant of the same type. This
  // is the only sound way past a loop without unrolling it: whatever the loop did, the
  // value afterwards is *some* value, constrained only by an invariant if one was written.
  function havoc(block: Stmt[], localEnv: Map<string, string>): Map<string, string> {
    const mods = new Set<string>();
    collectAssignedVars(block, mods);
    const out = new Map(localEnv);
    for (const name of mods) {
      const fresh = `${name.replace(/[^A-Za-z0-9_]/g, "_")}__loop${ctx.havocSeq++}`;
      // No annotation and no float literal to learn from means Int, matching how the rest
      // of this file treats an unknown type. A float local would be modelled as an integer
      // here, which is why floatish() also looks at the initializer.
      const typeName = varTypes.get(name) ?? "i64";
      ctx.havocDecls.push(declareConst(fresh, typeName));
      const range = intRangeAssumption(fresh, typeName);
      if (range) ctx.havocDecls.push(range);
      CALL_MODEL?.scope.add(fresh);
      out.set(name, fresh);
    }
    return out;
  }


  // Replace one name — and every flattened field hanging off it, since `&mut c` may write
  // any of `c.x`, `c.y` — with fresh unknowns.
  function havocName(name: string, localEnv: Map<string, string>): void {
    // `name` may be a field path (`a_data`), in which case only that field and what hangs
    // off it moves. The ROOT symbol is deliberately left alone: a field read resolves by
    // longest bound prefix, so havocing `a` would shadow every sibling — `a.live` would
    // rebase onto `a__mut2_live` and a type invariant about it becomes unprovable for any
    // function that merely pushes to a vec field. Leaving `a` stale costs nothing, since a
    // struct-as-scalar symbol carries no information this encoding can use.
    const targets = [name, ...[...(FIELD_REFS ?? [])].filter(f => f.startsWith(`${name}_`))];
    for (const target of targets) {
      const fresh = `${target.replace(/[^A-Za-z0-9_]/g, "_")}__mut${ctx.havocSeq++}`;
      const typeName = varTypes.get(target) ?? (target === name ? "i64" : "i64");
      ctx.havocDecls.push(declareConst(fresh, typeName));
      const range = intRangeAssumption(fresh, typeName);
      if (range) ctx.havocDecls.push(range);
      CALL_MODEL?.scope.add(fresh);
      localEnv.set(target, fresh);
    }
  }

  // Relate a mutating call's post-call symbols back to its pre-call ones, using the callee's
  // own `ensures`. Havocing the argument is what makes the walker sound; without this the
  // caller learns NOTHING from a `&mut` callee's contract, which is why
  // `construct(lencode, ...)` used to erase `lencode.count.len == 16` and every downstream
  // precondition about it was refuted for a table that is provably 16 entries long.
  //
  // The clause is lowered twice over: once against the post-call symbols (the contract's own
  // reading) and once against the pre-call ones (what `old(...)` inside it means). Asserted
  // as an implication from the callee's `requires`, never bare — the bare form would let an
  // obligation discharge itself, exactly as in modelCall.
  function emitFrameFacts(mutCalls: MutatingCall[], preEnv: Map<string, string>, postEnv: Map<string, string>): void {
    const ctx = CALL_MODEL;
    if (!ctx) return;
    for (const mc of mutCalls) {
      const subst = (env: Map<string, string>): Map<string, string> => {
        const out = new Map<string, string>();
        for (let i = 0; i < mc.callee.params.length; i++) {
          const argSmt = exprToSmtWithEnv(mc.args[i]!, env);
          // A struct argument often has no whole-value translation — `Huff { .. }` lowers to
          // an UNSUPPORTED marker — while every FIELD of it does. Leaving the parameter
          // unbound keeps a clause that names it bare untranslatable (so it is dropped) but
          // still lets `h.count.len` rebase through the field bindings below, which is the
          // only part of the frame condition that carries information.
          if (!/UNSUPPORTED/.test(argSmt)) out.set(mc.callee.params[i]!.name, argSmt);
        }
        // A `&mut` struct parameter is written field-wise, and each field has its own symbol
        // on the caller side. Binding the flattened prefixes is what lets `h.count.len`
        // rebase onto the caller's `lencode_count` rather than inventing a callee-side name.
        for (const [k, v] of fieldBindings(mc.callee.params, mc.args, env)) out.set(k, v);
        return out;
      };
      const post = subst(postEnv), pre = subst(preEnv);
      // `result` has no binding here — a statement-position call discards it, and a call in
      // value position is modelled separately by modelCall. Clauses naming it are that
      // model's business, not this one's.
      const clauses = mc.callee.contracts
        .filter(c => c.kind === "ensures" && !mentionsAnyIdent(c.expr, new Set(["result"])))
        .map(c => exprToSmtWithEnv(c.expr, post, true, pre))
        .filter(smt => !/UNSUPPORTED/.test(smt) && symbolsResolve(smt, ctx));
      if (clauses.length === 0) continue;
      const guards = mc.callee.contracts
        .filter(c => c.kind === "requires")
        .map(c => exprToSmtWithEnv(c.expr, pre, true));
      if (guards.some(g => /UNSUPPORTED/.test(g)) || !guards.every(g => symbolsResolve(g, ctx))) continue;
      const conclusion = clauses.length === 1 ? clauses[0]! : `(and ${clauses.join(" ")})`;
      const antecedent = guards.length === 0 ? null
        : guards.length === 1 ? guards[0]! : `(and ${guards.join(" ")})`;
      ctx.assumes.push(`(assert ${antecedent ? `(=> ${antecedent} ${conclusion})` : conclusion})`);
      ctx.assumed.add(mc.callee.name);
    }
  }

  // for void functions, we need to capture final env state
  const finalEnvs: { conditions: string[]; env: Map<string, string> }[] = [];
  const breakEnvs: { conditions: string[]; env: Map<string, string> }[] = [];
  const continueEnvs: { conditions: string[]; env: Map<string, string> }[] = [];

  function walkCapture(stmts: Stmt[], idx: number, pathConds: string[], localEnv: Map<string, string>): void {
    for (let i = idx; i < stmts.length; i++) {
      const stmt = stmts[i];
      // Record calls before the statement updates the env, so an argument is lowered in
      // the state that actually holds at the call. Loops/match are not modelled by this
      // walker at all, so calls inside them are never recorded — missed coverage rather
      // than a VC built on conditions we cannot see.
      const st = stmt as any;
      for (const key of ["value", "expr", "cond", "subject"]) {
        if (st[key] && st[key].kind) collectCallsInExpr(st[key], pathConds, localEnv, calls);
        if (st[key] && st[key].kind) collectStructLitsInExpr(st[key], pathConds, localEnv, structLits);
      }

      // What this statement's own expressions mutate out from under the walker. Nested
      // bodies are excluded — walkCapture reaches those statements itself.
      const mutated = new Set<string>();
      for (const key of ["value", "expr", "cond", "subject", "target"]) {
        if (st[key] && st[key].kind) collectMutations(st[key], mutated);
      }
      const mutCalls: MutatingCall[] = [];
      for (const key of ["value", "expr", "cond", "subject", "target"]) {
        if (st[key] && st[key].kind) collectMutatingCalls(st[key], mutCalls);
      }
      // Applied AFTER the statement's own env update, so the call's arguments are still
      // lowered in the pre-call state while everything downstream sees the unknown.
      const applyMutations = () => {
        const preEnv = mutCalls.length > 0 ? new Map(localEnv) : null;
        for (const name of mutated) havocName(name, localEnv);
        if (preEnv) emitFrameFacts(mutCalls, preEnv, localEnv);
      };

      if (stmt.kind === "LetDecl" || stmt.kind === "VarDecl") {
        if (stmt.type?.name) varTypes.set(stmt.name, stmt.type.name);
        else {
          const inferred = inferLiteralType(stmt.value);
          if (inferred) varTypes.set(stmt.name, inferred);
        }
        // A struct literal binds each field, not just the whole value: `Huff { count:
        // zeros(16) }` is what connects `zeros`' `ensures result.len == n` to a later
        // `h.count.len >= 16`. Without it the whole literal lowers to one UNSUPPORTED
        // marker and every field of it is a free unknown.
        if (stmt.value?.kind === "StructLit") {
          for (const f of stmt.value.fields) {
            const sym = `${stmt.name}_${f.name}`;
            FIELD_REFS?.add(sym);
            localEnv.set(sym, exprToSmtWithEnv(f.value, localEnv));
          }
        }
        if (stmt.value) localEnv.set(stmt.name, exprToSmtWithEnv(stmt.value, localEnv));
        applyMutations();
        continue;
      }
      if (stmt.kind === "Assign") {
        if (stmt.target.kind === "Ident") {
          localEnv.set(stmt.target.name, exprToSmtWithEnv(stmt.value, localEnv));
        } else if (stmt.target.kind === "FieldAccess") {
          const flat = flattenFieldAccess(stmt.target);
          if (flat) localEnv.set(flat, exprToSmtWithEnv(stmt.value, localEnv));
        }
        applyMutations();
        continue;
      }
      applyMutations();
      if (stmt.kind === "Return") {
        const val = stmt.value ? exprToSmtWithEnv(stmt.value, localEnv) : "0";
        paths.push({ conditions: [...pathConds], result: val, env: new Map(localEnv) });
        return;
      }
      if (stmt.kind === "BreakStmt") {
        breakEnvs.push({ conditions: [...pathConds], env: new Map(localEnv) });
        return;
      }
      if (stmt.kind === "ContinueStmt") {
        continueEnvs.push({ conditions: [...pathConds], env: new Map(localEnv) });
        return;
      }
      if (stmt.kind === "UnsafeBlock") {
        walkCapture([...stmt.body, ...stmts.slice(i + 1)], 0, pathConds, new Map(localEnv));
        return;
      }
      if (stmt.kind === "IfStmt") {
        const cond = exprToSmtWithEnv(stmt.cond, localEnv);
        const remainder = stmts.slice(i + 1);
        walkCapture([...stmt.thenBody, ...remainder], 0, [...pathConds, cond], new Map(localEnv));
        const negCond = `(not ${cond})`;
        walkCapture([...(stmt.elseBody ?? []), ...remainder], 0, [...pathConds, negCond], new Map(localEnv));
        return;
      }
      if (stmt.kind === "WhileStmt") {
        // Establishment is checked against the state that reaches the loop, so it has to be
        // recorded before the havoc wipes it.
        const havocEnv = havoc(stmt.body, localEnv);
        const guard = exprToSmtWithEnv(stmt.cond, havocEnv);
        const assumed = (stmt.invariants ?? [])
          .filter(inv => inv.kind === "invariant")
          .map(inv => exprToSmtWithEnv(inv.expr, havocEnv))
          .filter(s => !/UNSUPPORTED/.test(s));
        const bodyRun = collectPaths(stmt.body, havocEnv, varTypes, ctx);
        structLits.push(...bodyRun.structLits);
        const active = [...pathConds, ...assumed, ...(/UNSUPPORTED/.test(guard) ? [] : [guard])];
        loops.push({
          entryConds: [...pathConds],
          entryEnv: new Map(localEnv),
          havocEnv: new Map(havocEnv),
          guard,
          invariants: (stmt.invariants ?? []).filter(c => c.kind === "invariant"),
          variants: (stmt.invariants ?? []).filter(c => c.kind === "decreases"),
          body: stmt.body,
          bodyRun,
        });
        loops.push(...bodyRun.loops.map(nested => ({
          ...nested,
          entryConds: [...active, ...nested.entryConds],
        })));
        for (const path of bodyRun.paths) {
          paths.push({ ...path, conditions: [...active, ...path.conditions] });
        }
        for (const call of bodyRun.calls) {
          calls.push({ ...call, conditions: [...active, ...call.conditions] });
        }
        // Past the loop, all that is known is: the invariant still holds (it was proved to,
        // by the two VCs above) and the guard is false. Everything the loop touched is now
        // one of the fresh constants. Assuming the invariant here is what makes a loop
        // provable at all; without it the walker used to carry the *pre-loop* values
        // forward and certify postconditions that the function violates at runtime.
        const remainder = stmts.slice(i + 1);
        const normalExit = [...pathConds, ...assumed, ...(/UNSUPPORTED/.test(guard) ? [] : [`(not ${guard})`])];
        walkCapture(remainder, 0, normalExit, new Map(havocEnv));
        for (const exit of bodyRun.breakEnvs) {
          walkCapture(remainder, 0, [...active, ...exit.conditions], new Map(exit.env));
        }
        return;
      }
      if (stmt.kind === "ForInStmt") {
        // A for-loop may run any number of times, so like a while loop it is crossed by
        // induction, not unrolling. What is different is that nothing in the body advances
        // the binding — the loop form owns that — so the index has to be modelled here:
        // fresh at an arbitrary iteration, bounded by the range, and bumped by one for the
        // preservation obligation.
        const invariants = (stmt.invariants ?? []).filter(c => c.kind === "invariant");
        const variants = (stmt.invariants ?? []).filter(c => c.kind === "decreases");
        const havocEnv = havoc(stmt.body, localEnv);
        const entryEnv = new Map(localEnv);
        const nextPatch = new Map<string, string>();
        // The membership predicate for the current index. Used exactly as a while loop's
        // guard is: a path condition on body-derived paths and an assumption in the
        // preservation query. An empty range makes it unsatisfiable, which is the right
        // answer — the body never runs, so everything downstream of it is unreachable.
        let guard = "";
        const idxName = stmt.varName;
        const freshIdx = () => {
          const fresh = `${idxName.replace(/[^A-Za-z0-9_]/g, "_")}__iter${ctx.havocSeq++}`;
          ctx.havocDecls.push(`(declare-const ${fresh} Int)`);
          CALL_MODEL?.scope.add(fresh);
          return fresh;
        };
        // Bindings the body introduces that are not assignments: the loop variable, and the
        // element binding of an indexed `for i, x in v`. Havoced so the body reads an
        // arbitrary iteration rather than a stale outer value of the same name.
        for (const extra of [stmt.varName, stmt.varName2].filter(Boolean) as string[]) {
          havocEnv.set(extra, freshIdx());
          // Distinct from the iteration symbol: at loop entry the binding has no value yet.
          // Leaving it unbound would emit the bare source name as an undeclared symbol and
          // the solver would reject the whole establishment query.
          entryEnv.set(extra, freshIdx());
        }
        let postLoopEnv = new Map(havocEnv);
        if (stmt.iterable.kind === "RangeExpr") {
          const lo = exprToSmtWithEnv(stmt.iterable.start, localEnv);
          const hi = exprToSmtWithEnv(stmt.iterable.end, localEnv);
          const i0 = havocEnv.get(idxName)!;
          if (!/UNSUPPORTED/.test(lo) && !/UNSUPPORTED/.test(hi)) {
            guard = `(and (>= ${i0} ${lo}) (< ${i0} ${hi}))`;
            entryEnv.set(idxName, lo);
            nextPatch.set(idxName, `(+ ${i0} 1)`);
            // After the loop the index sits one past the last one executed — or never moved
            // at all, if the range was empty. Establishment gives the invariant at `lo` and
            // preservation carries it up to `hi`, so this `ite` is precisely the index the
            // induction actually reached, and assuming the invariant there is sound.
            postLoopEnv.set(idxName, `(ite (> ${hi} ${lo}) ${hi} ${lo})`);
          }
        } else if (stmt.varName2 && stmt.iterable.kind === "Ident") {
          // `for i, x in v` — the index is in range even though the element is opaque.
          const base = exprToSmtWithEnv(stmt.iterable, localEnv);
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) {
            const lenSym = `${base}_len`;
            FIELD_REFS?.add(lenSym);
            const i0 = havocEnv.get(idxName)!;
            guard = `(and (>= ${i0} 0) (< ${i0} ${lenSym}))`;
            entryEnv.set(idxName, "0");
            nextPatch.set(idxName, `(+ ${i0} 1)`);
            postLoopEnv.set(idxName, `(ite (> ${lenSym} 0) ${lenSym} 0)`);
          }
        }
        // An invariant naming the loop variable of an UNCOUNTED loop says nothing after the
        // loop: the next element bears no relation to the last one. Carrying it forward
        // would assume a fact about a value the induction never established.
        const boundNames = [stmt.varName, ...(stmt.varName2 ? [stmt.varName2] : [])];
        const carried = invariants.filter(inv =>
          nextPatch.size > 0 ? !mentionsAnyIdent(inv.expr, new Set(stmt.varName2 ? [stmt.varName2] : []))
                             : !mentionsAnyIdent(inv.expr, new Set(boundNames)));
        const assumed = invariants
          .map(inv => exprToSmtWithEnv(inv.expr, havocEnv))
          .filter(s => !/UNSUPPORTED/.test(s));
        const bodyRun = collectPaths(stmt.body, havocEnv, varTypes, ctx);
        structLits.push(...bodyRun.structLits);
        const active = [...pathConds, ...assumed, ...(guard && !/UNSUPPORTED/.test(guard) ? [guard] : [])];
        loops.push({
          entryConds: [...pathConds],
          entryEnv,
          havocEnv: new Map(havocEnv),
          guard,
          invariants,
          variants,
          body: stmt.body,
          bodyRun,
          nextPatch,
        });
        loops.push(...bodyRun.loops.map(nested => ({
          ...nested,
          entryConds: [...active, ...nested.entryConds],
        })));
        for (const path of bodyRun.paths) {
          paths.push({ ...path, conditions: [...active, ...path.conditions] });
        }
        for (const call of bodyRun.calls) {
          calls.push({ ...call, conditions: [...active, ...call.conditions] });
        }
        const remainder = stmts.slice(i + 1);
        const exitAssumed = carried
          .map(inv => exprToSmtWithEnv(inv.expr, postLoopEnv))
          .filter(s => !/UNSUPPORTED/.test(s));
        walkCapture(remainder, 0, [...pathConds, ...exitAssumed], new Map(postLoopEnv));
        for (const exit of bodyRun.breakEnvs) {
          walkCapture(remainder, 0, [...active, ...exit.conditions], new Map(exit.env));
        }
        return;
      }
      if (stmt.kind === "MatchStmt" || stmt.kind === "IfLetStmt" || stmt.kind === "LetElseStmt") {
        // Pattern predicates are not translated yet. Explore every possible arm so an exit
        // can make a proof fail, but never disappear and make an invalid proof pass.
        const branches: Stmt[][] = stmt.kind === "MatchStmt"
          ? stmt.arms.map(arm => arm.body)
          : stmt.kind === "IfLetStmt"
            ? [stmt.thenBody, stmt.elseBody ?? []]
            : [[], stmt.elseBody];
        const remainder = stmts.slice(i + 1);
        for (const branch of branches) {
          walkCapture([...branch, ...remainder], 0, pathConds, new Map(localEnv));
        }
        return;
      }
      // skip unhandled statements
    }
    // reached end of body without return → void path
    finalEnvs.push({ conditions: [...pathConds], env: new Map(localEnv) });
  }

  walkCapture(stmts, 0, [], new Map(env));
  return { paths, finalEnvs, breakEnvs, continueEnvs, calls, havocDecls: ctx.havocDecls, loops, structLits };
}

// `x.len` on a string/Vec/array can never be negative, and the solver has no way to know
// that on its own — without it, `requires key.len == 16` is refuted by a counterexample
// where the key is -1 bytes long.
//
// Deliberately NOT applied to every symbol ending in `_len`: a user struct may have a
// plain `len: i64` field that legitimately goes negative, and asserting a false fact about
// it would be a false PROOF, not a missed one. Only bases whose declared type actually
// carries a length qualify, so an unknown-typed base gets nothing.
function lengthNonNeg(refs: Set<string>, fn: Function): string[] {
  const lenBearing = new Set<string>();
  const consider = (name: string, t: MiloType | null | undefined) => {
    if (t && (t.name === "string" || t.name === "Vec" || t.isArray)) lenBearing.add(name);
  };
  for (const p of fn.params) consider(p.name, p.type);
  const scan = (stmts: Stmt[]): void => {
    for (const s of stmts as any[]) {
      if ((s.kind === "LetDecl" || s.kind === "VarDecl") && s.type) consider(s.name, s.type);
      for (const key of ["body", "thenBody", "elseBody"]) if (Array.isArray(s[key])) scan(s[key]);
      if (Array.isArray(s.arms)) for (const arm of s.arms) if (Array.isArray(arm.body)) scan(arm.body);
    }
  };
  scan(fn.body);
  return [...refs]
    .filter(r => r.endsWith("_len") && lenBearing.has(r.slice(0, -"_len".length)))
    .map(r => `(assert (>= ${r} 0))`);
}

// `if c { a } else { b }` as a VALUE, which is `ite` in SMT. Both arms must be a single
// expression statement — an arm that computes anything (a `let`, a loop, an early return)
// has no `ite` translation, and inventing one would state something the code does not do.
// Milo uses this form constantly, so without a rule whole postconditions went unknown for
// a construct that maps onto the theory exactly.
function ifExprArm(body: Stmt[]): Expr | null {
  if (body.length !== 1) return null;
  const only = body[0] as any;
  if (only.kind === "Return" && only.value) return only.value as Expr;
  if (only.kind === "ExprStmt" && only.expr) return only.expr as Expr;
  return null;
}

// `x.len()` rewritten as `x.len`, so one code path handles both spellings. Zero-arg and
// name-checked: `v.len()` is a pure length, `v.pop()` is not.
function lenMethodAsField(expr: any): Expr | null {
  if (expr.kind !== "MethodCall" || expr.method !== "len") return null;
  if (expr.args && expr.args.length > 0) return null;
  return { kind: "FieldAccess", object: expr.object, field: "len", span: expr.span } as Expr;
}

function collectFieldRefs(expr: Expr, refs: Set<string>): void {
  if (!expr) return;
  if (expr.kind === "MethodCall") {
    const asLen = lenMethodAsField(expr);
    if (asLen) { collectFieldRefs(asLen, refs); return; }
    return;
  }
  if (expr.kind === "FieldAccess") {
    const flat = flattenFieldAccess(expr);
    if (flat && flat.includes("_")) refs.add(flat);
    return;
  }
  if (expr.kind === "BinOp") { collectFieldRefs(expr.left, refs); collectFieldRefs(expr.right, refs); return; }
  if (expr.kind === "UnaryOp") { collectFieldRefs(expr.operand, refs); return; }
}

function collectFieldRefsFromBody(stmts: Stmt[], refs: Set<string>): void {
  for (const stmt of stmts) {
    if (stmt.kind === "Assign") {
      if (stmt.target.kind === "FieldAccess") {
        const flat = flattenFieldAccess(stmt.target);
        if (flat && flat.includes("_")) refs.add(flat);
      }
      collectFieldRefs(stmt.value, refs);
    } else if (stmt.kind === "LetDecl" || stmt.kind === "VarDecl") {
      if (stmt.value) collectFieldRefs(stmt.value, refs);
    } else if (stmt.kind === "Return" && stmt.value) {
      collectFieldRefs(stmt.value, refs);
    } else if (stmt.kind === "IfStmt") {
      collectFieldRefs(stmt.cond, refs);
      collectFieldRefsFromBody(stmt.thenBody, refs);
      if (stmt.elseBody) collectFieldRefsFromBody(stmt.elseBody, refs);
    } else if (stmt.kind === "UnsafeBlock") {
      collectFieldRefsFromBody(stmt.body, refs);
    }
  }
}

function flattenFieldAccess(expr: Expr): string | null {
  if (expr.kind === "Ident") return expr.name;
  if (expr.kind === "FieldAccess") {
    const obj = flattenFieldAccess(expr.object);
    if (obj) return `${obj}_${expr.field}`;
  }
  return null;
}

// Substitute a field access through its BASE identifier. At a call site the env maps the
// callee's parameter (`key`) to the caller's argument, never the flattened `key_len` — so
// lowering `requires key.len == 16` against the flat name alone emitted the CALLEE's
// symbol into the CALLER's query, where nothing declares it. Both solvers then reported an
// error about a constant the user never wrote, and the precondition went unchecked: 13 of
// the tree's translator errors were this one bug (`key_len`, `iv_len`, `s_len`).
//
// Only a base that maps to a plain symbol can be rebased — `f(a + b).len` has no name to
// hang a field on, and inventing one would silently check a different obligation.
// Null when the base can't carry a field: not a plain identifier at the root, not
// substituted, or substituted to an expression rather than a symbol (`let iv =
// ivFromCount(count)` maps `iv` to a call-model constant or an UNSUPPORTED marker — there
// is nothing to append `_len` to). The caller decides what null means in its scope.
function rebaseFieldAccess(expr: Expr, env: Map<string, string>): { kind: "rebased"; name: string } | { kind: "no" } {
  const fields: string[] = [];
  let node: Expr = expr;
  while (node.kind === "FieldAccess") {
    fields.unshift(node.field);
    node = node.object;
  }
  if (node.kind !== "Ident") return { kind: "no" };
  // Longest bound prefix wins. `lencode.count.len` has no binding as a whole, but
  // `lencode_count` does (from the struct literal), and hanging `_len` off that symbol is
  // what lets `zeros`' postcondition reach this obligation. Falls back to the base itself,
  // which is the call-site substitution case.
  for (let take = fields.length; take >= 0; take--) {
    const key = [node.name, ...fields.slice(0, take)].join("_");
    const bound = env.get(key);
    if (bound === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(bound)) continue;
    const name = [bound, ...fields.slice(take)].join("_");
    FIELD_REFS?.add(name);   // the query has to declare what this substitution invented
    return { kind: "rebased", name };
  }
  return { kind: "no" };
}

// Field symbols invented during lowering, collected so the enclosing function's
// declaration block can declare them. Scoped to one function's VC build, like CALL_MODEL.
let FIELD_REFS: Set<string> | null = null;

// `foreign` marks lowering of a CALLEE's contract under a parameter substitution, where
// every name belongs to the callee's scope, not this query's. There a name the
// substitution doesn't cover (the callee's own local, a field of its receiver) has no
// meaning here: emitting it raw puts an undeclared symbol in the query — which both
// solvers report as an error naming a constant the user never wrote — or, worse, collides
// with an unrelated caller-side name and checks a different obligation than the one asked.
// In the caller's own body env the same flat names ARE this scope's, and declared.
function exprToSmtWithEnv(expr: Expr, env: Map<string, string>, foreign = false, oldEnv?: Map<string, string>): string {
  if (!expr) return "0";
  // `old(e)` names the value `e` held at entry. In a FOREIGN lowering the substitution map
  // usually binds each parameter to the caller's argument as it stood at the call, so there
  // the pre-state is `env` itself — that is what makes a callee's `ensures result == old(n)
  // + 1` usable at the call site. The exception is the frame assumption below, where `env`
  // deliberately binds the POST-call symbols and `oldEnv` carries the pre-call ones.
  if (isOldCall(expr)) {
    const pre = oldEnv ?? (foreign ? env : OLD_ENV);
    if (!pre) return `(UNSUPPORTED old)`;
    return exprToSmtWithEnv((expr as any).args[0]!, pre, foreign, oldEnv);
  }
  if (expr.kind === "Ident") {
    const mapped = env.get(expr.name);
    if (mapped) return mapped;
    if (expr.name === "result") return "result";
    const konst = GLOBAL_CONST_SMT.get(expr.name);
    if (konst) return konst;   // module-level const: shared by both scopes
    return foreign ? `(UNSUPPORTED Ident)` : expr.name;
  }
  if (expr.kind === "FieldAccess") {
    const flat = flattenFieldAccess(expr);
    if (flat) {
      const mapped = env.get(flat);
      if (mapped) return mapped;
      const r = rebaseFieldAccess(expr, env);
      if (r.kind === "rebased") return r.name;
      return foreign ? `(UNSUPPORTED FieldAccess)` : flat;
    }
  }
  if (expr.kind === "BinOp") {
    const left = exprToSmtWithEnv(expr.left, env, foreign, oldEnv);
    const bit = bitOpToSmt(expr.op, left, expr.right);
    if (bit) return bit;
    const right = exprToSmtWithEnv(expr.right, env, foreign, oldEnv);
    const rdiv = realDivToSmt(expr.op, left, right);
    if (rdiv) return rdiv;
    if (expr.op === "/" || expr.op === "%") {
      const t = truncDivToSmt(expr.op, left, right, resolveConstNum(expr.right));
      if (t) return t;
    }
    return `(${binOpToSmt(expr.op)} ${left} ${right})`;
  }
  if (expr.kind === "CastExpr") {
    return castToSmt(exprToSmtWithEnv(expr.operand, env, foreign, oldEnv), expr.targetType?.name ?? "i64");
  }
  if (expr.kind === "UnaryOp") {
    if (expr.op === "!") return `(not ${exprToSmtWithEnv(expr.operand, env, foreign, oldEnv)})`;
    if (expr.op === "-") return `(- ${exprToSmtWithEnv(expr.operand, env, foreign, oldEnv)})`;
  }
  if (expr.kind === "IfExpr") {
    const t = ifExprArm(expr.thenBody), e = ifExprArm(expr.elseBody);
    if (t && e) {
      return `(ite ${exprToSmtWithEnv(expr.cond, env, foreign, oldEnv)} ` +
             `${exprToSmtWithEnv(t, env, foreign, oldEnv)} ${exprToSmtWithEnv(e, env, foreign, oldEnv)})`;
    }
    return `(UNSUPPORTED IfExpr)`;
  }
  if (expr.kind === "MethodCall") {
    const asLen = lenMethodAsField(expr);
    if (asLen) return exprToSmtWithEnv(asLen, env, foreign, oldEnv);
  }
  if (expr.kind === "Call" && typeof expr.func === "string") {
    const modeled = modelCall(expr, expr.func, expr.args, env);
    if (modeled) return modeled;
    return `(UNSUPPORTED_CALL ${expr.func})`;
  }
  return exprToSmt(expr);
}

// onlyFile: restrict VCs to functions declared in that absolute path (the entry
// file). Functions with no sourceFile (single-file program, no imports) are always
// kept. Without it, imported stdlib contracts flood the report with unmodeled-theory noise.
// Whether a body calls anything with a `requires`, so a contract-free fn is still visited
// for its call-site obligations. Deliberately shallow-but-broad: over-reporting here only
// costs a walk that finds nothing.
function callsAContractedFn(stmts: Stmt[], contracted: Map<string, Function>): boolean {
  let found = false;
  const seen = new Set<any>();
  const scan = (node: any) => {
    if (!node || typeof node !== "object" || found || seen.has(node)) return;
    seen.add(node);
    if (node.kind === "Call" && typeof node.func === "string" && contracted.has(node.func)) { found = true; return; }
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === "object") scan(v);
    }
  };
  stmts.forEach(scan);
  return found;
}

// Whether a body builds a struct that carries an invariant. Such a function owes the
// establishment obligation even with no contract of its own.
function constructsInvariantStruct(stmts: Stmt[]): boolean {
  let found = false;
  const seen = new Set<any>();
  const scan = (node: any) => {
    if (!node || typeof node !== "object" || found || seen.has(node)) return;
    seen.add(node);
    if (node.kind === "StructLit" && STRUCT_INVARIANTS.has(node.name)) { found = true; return; }
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === "object") scan(v);
    }
  };
  stmts.forEach(scan);
  return found;
}

export function generateVerificationConditions(program: Program, opts?: { onlyFile?: string }): VerifyResult {
  const conditions: VerificationCondition[] = [];
  let contractCount = 0;
  let loopCount = 0;

  // Resolve immutable top-level constants once, in source order (a global may
  // reference an earlier one), so contracts can inline them as SMT literals.
  GLOBAL_CONST_SMT = new Map();
  GLOBAL_CONST_NUM = new Map();
  for (const g of program.globals ?? []) {
    if (g.mutable) continue;
    const num = resolveConstNum(g.value);
    if (num !== null) {
      GLOBAL_CONST_NUM.set(g.name, num);
      GLOBAL_CONST_SMT.set(g.name, numToSmt(num));
    } else {
      GLOBAL_CONST_SMT.set(g.name, exprToSmt(g.value));
    }
  }

  // Impl methods are verified like free functions, under their qualified `Type.method`
  // name — the same key `rewriteStaticCalls` produces for their call sites. The stdlib
  // reorg moved contracts (e.g. std/math's `requires x >= 0`) onto `impl` methods; without
  // this they'd carry no VCs and every caller's `Math.foo()` would havoc.
  const implMethods: Function[] = [];
  for (const im of program.impls ?? []) {
    for (const m of im.methods) implMethods.push({ ...m, name: `${im.typeName}.${m.name}` });
  }
  const allFns = [...program.functions, ...implMethods];

  // Rewrite `Type.method(..)` EnumLits to Calls across every body and contract, excluding
  // any key that is actually an enum variant (a real construction must not be rewritten).
  const implKeys = new Set(implMethods.map(m => m.name));
  const enumVariantKeys = new Set<string>();
  for (const en of program.enums ?? []) for (const v of en.variants) enumVariantKeys.add(`${en.name}.${v.name}`);
  for (const k of enumVariantKeys) implKeys.delete(k);
  for (const fn of allFns) {
    rewriteStaticCalls(fn.body, implKeys);
    for (const c of fn.contracts) rewriteStaticCalls(c.expr, implKeys);
  }

  FN_TABLE = new Map(allFns.map(f => [f.name, f]));
  PURE_FN_NAMES = new Set(allFns.filter(mutatesNothing).map(f => f.name));
  PURE_METHOD_NAMES = new Set<string>();
  {
    const byBareName = new Map<string, Function[]>();
    for (const m of implMethods) {
      const bare = m.name.slice(m.name.indexOf(".") + 1);
      (byBareName.get(bare) ?? byBareName.set(bare, []).get(bare)!).push(m);
    }
    for (const [bare, ms] of byBareName) if (ms.every(mutatesNothing)) PURE_METHOD_NAMES.add(bare);
  }
  BOOL_FIELDS = collectBoolFields(program);
  FLOAT_FIELDS = collectFloatFields(program);
  STRUCT_INVARIANTS = new Map();
  STRUCT_FIELDS = new Map();
  for (const st of program.structs ?? []) {
    STRUCT_FIELDS.set(st.name, (st.fields as any[]).map(f => f.name));
    const invs = (st.invariants ?? []).filter(c => c.kind === "invariant");
    if (invs.length > 0) STRUCT_INVARIANTS.set(st.name, invs);
  }

  // Callee preconditions, for the call-site obligations below.
  const requiresByFn = new Map<string, Function>();
  // Callee postconditions, for modelling calls that appear inside a body or contract.
  const ensuresByFn = new Map<string, Function>();
  for (const fn of allFns) {
    if (fn.contracts.some(c => c.kind === "requires")) requiresByFn.set(fn.name, fn);
    if (fn.contracts.some(c => c.kind === "ensures")) ensuresByFn.set(fn.name, fn);
  }

  for (const fn of allFns) {
    if (opts?.onlyFile && fn.sourceFile && fn.sourceFile !== opts.onlyFile) continue;
    // A fn with no contracts of its own still has to honour the ones it calls.
    const callsContracted = callsAContractedFn(fn.body, requiresByFn);
    // A constructor may carry no contract of its own and still owe one: every reader of the
    // struct it builds gets to assume that type's invariant. So may a mutator — skipping a
    // function that can write through a `&mut S` would leave S's invariant assumed
    // everywhere and maintained nowhere, which is a hole, not a gap in coverage.
    const touchesInvariantStruct = STRUCT_INVARIANTS.size > 0 &&
      (constructsInvariantStruct(fn.body) ||
       fn.params.some(p => (p.type?.isRefMut || p.type?.isPtr) && p.type?.name && STRUCT_INVARIANTS.has(p.type.name)));
    if (fn.contracts.length === 0 && !hasLoopInvariants(fn.body) && !callsContracted && !touchesInvariantStruct) continue;

    const requires = fn.contracts.filter(c => c.kind === "requires");
    const ensures = fn.contracts.filter(c => c.kind === "ensures");
    const decreases = fn.contracts.filter(c => c.kind === "decreases");
    contractCount += fn.contracts.length;

    CALL_MODEL = { ensuresByFn, decls: [], assumes: [], n: 0, bySite: new WeakMap<object, Map<string, string>>(), byPureKey: new Map(), scope: new Set(), assumed: new Set() };
    const vcStart = conditions.length;

    // Sorts are per-function: the same Milo name is an i64 here and an f64 in the next
    // function. `result` is seeded rather than left to its own declaration further down,
    // because `ensures` is lowered before that point and lowering is what needs the sort.
    REAL_SYMS = new Set();
    NONREAL_SYMS = new Set();
    if (fn.retType?.name) (miloTypeToSmt(fn.retType.name) === "Real" ? REAL_SYMS : NONREAL_SYMS).add("result");

    const paramDecls = fn.params.map(p => declareConst(p.name, p.type?.name ?? "i64")).join("\n");
    // What the type already guarantees. Without it the solver invents out-of-range inputs.
    const paramRanges = fn.params
      .map(p => intRangeAssumption(p.name, p.type?.name))
      .filter(Boolean).join("\n");

    // collect all field access references used in contracts and body, declare as SMT constants
    const fieldRefs = new Set<string>();
    for (const c of fn.contracts) collectFieldRefs(c.expr, fieldRefs);
    collectFieldRefsFromBody(fn.body, fieldRefs);
    // Lowering below (body walk, call-site obligations) invents more of these by
    // substitution, so the set stays open until the declaration block is assembled.
    FIELD_REFS = fieldRefs;
    MUTABLE_NAMES = collectMutableNames(fn);
    // Must be set before any contract or body expression is lowered — that is when call
    // modelling runs and needs to know which symbols this function's query declares.
    CALL_MODEL.scope = new Set([...fn.params.map(p => p.name), ...fieldRefs, "result"]);

    // One symbolic run, shared by every VC below. It has to happen before the declaration
    // block is assembled: walking the body is what discovers the havoc constants, and each
    // one has to be declared in the same block the path conditions referencing it land in.
    const paramEnv = new Map<string, string>();
    const paramTypes = new Map<string, string>();
    for (const p of fn.params) {
      paramEnv.set(p.name, p.name);
      if (p.type?.name) paramTypes.set(p.name, p.type.name);
    }
    // `old(e)` reads this and nothing else. It must be a snapshot: the walker mutates its
    // own environments in place, and an `old` that followed those edits would be the
    // current state under another name.
    OLD_ENV = new Map(paramEnv);
    const symResult = collectPaths(fn.body, paramEnv, paramTypes);

    // Call-site obligations: the prover proves a callee's `ensures` GIVEN its `requires`,
    // and nothing proved the caller actually delivers that `requires`. Statically it was
    // an assumption. (Debug builds do assert it at entry — language-reference.md:267 —
    // so this closes the *static* half, not an unchecked hole.)
    //
    // Lowered BEFORE the declaration block is assembled: substituting the callee's params
    // for the caller's arguments is what invents symbols like `key_len`, and they have to
    // reach `fieldRefs` in time to be declared.
    const callObligations: { callee: string; obligation: string; guard: string }[] = [];
    for (const call of symResult.calls) {
      const callee = requiresByFn.get(call.name);
      if (!callee || callee.name === fn.name) continue;   // self-recursion: needs induction, skip
      if (call.args.length !== callee.params.length) continue;  // variadic/defaulted: can't map args to params
      // Substitute the callee's params with the caller's arg expressions.
      const subst = new Map<string, string>(call.fields);
      callee.params.forEach((p, idx) => subst.set(p.name, call.args[idx]!));
      for (const req of callee.contracts.filter(c => c.kind === "requires")) {
        const obligation = exprToSmtWithEnv(req.expr, subst, true);
        // An untranslatable obligation is KEPT, marker and all: the marker makes it report
        // `unknown` with the reason attached. Dropping it here (what this did before) made
        // an unchecked precondition indistinguishable from a checked one — the call simply
        // wasn't in the report, so nothing said the guarantee was resting on nothing.
        const guard = call.conditions.length > 0 ? `(assert (and ${call.conditions.join(" ")}))` : "";
        callObligations.push({ callee: callee.name, obligation, guard });
      }
    }

    // A struct invariant is a property of the type, so every value of that type satisfies it
    // wherever it is observed — including a parameter on entry. This is what makes
    // `prg.len >= 16384` usable inside a function that never checks it: the loader
    // established it, and the type carries it. What establishes it is the obligation at each
    // struct literal below; without that half this would be an unchecked assumption.
    const structAssumptions: string[] = [];
    const assumedInvariants = new Set<string>();
    const invariantParams = fn.params.filter(p => p.type?.name && STRUCT_INVARIANTS.has(p.type.name));
    for (const p of invariantParams) {
      for (const inv of STRUCT_INVARIANTS.get(p.type!.name)!) {
        const fieldEnv = new Map<string, string>();
        for (const f of STRUCT_FIELDS.get(p.type!.name) ?? []) {
          const sym = `${p.name}_${f}`;
          fieldRefs.add(sym);
          fieldEnv.set(f, sym);
        }
        const smt = instantiateInvariant(inv, fieldEnv);
        if (!/UNSUPPORTED/.test(smt)) { structAssumptions.push(`(assert ${smt})`); assumedInvariants.add(p.type!.name); }
      }
    }

    const fieldSort = (f: string) => {
      const leaf = f.slice(f.lastIndexOf("_") + 1);
      if (BOOL_FIELDS.has(leaf)) return "Bool";
      if (FLOAT_FIELDS.has(leaf)) return "Real";
      return "Int";
    };
    const fieldDecls = [...fieldRefs].map(f => {
      const sort = fieldSort(f);
      if (sort === "Real") REAL_SYMS.add(f);
      return `(declare-const ${f} ${sort})`;
    }).join("\n");
    const lenFacts = lengthNonNeg(fieldRefs, fn).join("\n");
    FIELD_REFS = null;

    let allDecls = fieldDecls ? `${paramDecls}\n${fieldDecls}` : paramDecls;
    if (paramRanges) allDecls = `${allDecls}\n${paramRanges}`;
    if (lenFacts) allDecls = `${allDecls}\n${lenFacts}`;
    if (symResult.havocDecls.length > 0) allDecls = `${allDecls}\n${symResult.havocDecls.join("\n")}`;
    allDecls = `${allDecls}\n${CALL_MODEL_SLOT}`;

    const preAssumptions = [
      ...requires.map(r => `(assert ${exprToSmt(r.expr)})`),
      ...structAssumptions,
    ].join("\n");

    for (const o of callObligations) {
      conditions.push({
        fn: fn.name,
        kind: "precondition",
        description: `call to ${o.callee} from ${fn.name}: ${o.obligation}`,
        smtlib: [
          `; Call-site precondition proof: ${fn.name} -> ${o.callee}`,
          `(set-logic ALL)`,
          allDecls,
          preAssumptions,
          o.guard,
          `(assert (not ${o.obligation}))`,
          `(check-sat)`,
        ].filter(Boolean).join("\n"),
      });
    }

    // Postconditions: symbolically execute body to build path constraints
    if (ensures.length > 0) {
      const isVoid = fn.retType.name === "void";

      for (const ens of ensures) {
        const postSmt = exprToSmt(ens.expr);

        // A postcondition names the state at EXIT, so it is lowered once per exit, in that
        // exit's environment — not once against the entry symbols. That is what makes a
        // clause about a `&mut` parameter mean anything: `ensures n == old(n) + 1` reads the
        // post-state for `n` and the entry state for `old(n)`, and the two are different
        // symbols only because the lowering happens here. Binding the flat entry symbol to
        // the final value instead (what this did before) would also silently overwrite the
        // struct-invariant assumptions above, which are stated about entry.
        const exits: { conditions: string[]; env: Map<string, string>; result?: string }[] =
          !isVoid && symResult.paths.length > 0
            ? symResult.paths.map(p => ({ conditions: p.conditions, env: p.env, result: p.result }))
            : isVoid ? symResult.finalEnvs.map(fe => ({ conditions: fe.conditions, env: fe.env }))
            : [];

        if (exits.length > 0) {
          const violations = exits.map(exit => {
            const post = exprToSmtWithEnv(ens.expr, exit.env);
            const parts = [
              ...exit.conditions,
              ...(exit.result !== undefined ? [`(= result ${exit.result})`] : []),
              `(not ${post})`,
            ];
            return `(and true ${parts.join(" ")})`;
          });
          const violated = violations.length === 1 ? violations[0] : `(or ${violations.join(" ")})`;
          conditions.push({
            fn: fn.name,
            kind: "postcondition",
            description: `postcondition of ${fn.name}: ${postSmt}`,
            smtlib: [
              `; Postcondition proof for ${fn.name}`,
              `(set-logic ALL)`,
              allDecls,
              ...(isVoid ? [] : [declareConst("result", fn.retType.name)]),
              preAssumptions,
              `(assert ${violated})`,
              `(check-sat)`,
            ].filter(Boolean).join("\n"),
          });
        } else {
          // no paths extracted — fall back to unconstrained check
          conditions.push({
            fn: fn.name,
            kind: "postcondition",
            description: `postcondition of ${fn.name}: ${postSmt}`,
            smtlib: [
              `; Postcondition check for ${fn.name} (no body analysis)`,
              `(set-logic ALL)`,
              allDecls,
              declareConst("result", fn.retType.name),
              preAssumptions,
              `(assert (not ${postSmt}))`,
              `(check-sat)`,
            ].join("\n"),
          });
        }
      }
    }

    // Struct invariants, the establishing half. Every use site above gets to ASSUME the
    // invariant of a value it receives; construction is where that has to be earned.
    for (const lit of symResult.structLits) {
      const fieldEnv = new Map(lit.fields);
      for (const inv of STRUCT_INVARIANTS.get(lit.struct) ?? []) {
        const smt = instantiateInvariant(inv, fieldEnv);
        const guard = lit.conditions.length > 0 ? `(assert (and true ${lit.conditions.join(" ")}))` : "";
        conditions.push({
          fn: fn.name,
          kind: "struct-invariant",
          invariantOf: lit.struct,
          description: `invariant of ${lit.struct} holds at construction in ${fn.name}: ${exprToSmt(inv.expr)}`,
          smtlib: [
            `; Struct invariant establishment: ${lit.struct} built in ${fn.name}`,
            `(set-logic ALL)`,
            allDecls,
            preAssumptions,
            guard,
            `(assert (not ${smt}))`,
            `(check-sat)`,
          ].filter(Boolean).join("\n"),
        });
      }
    }

    // ...and the maintaining half. A function that can write through a `&mut S` can also
    // break S's invariant, and every later reader assumes it. Only `&mut` parameters need
    // this: a by-value parameter is the callee's own copy, and `&S` cannot be written at all.
    for (const p of invariantParams) {
      if (!p.type?.isRefMut && !p.type?.isPtr) continue;
      const fields = STRUCT_FIELDS.get(p.type.name) ?? [];
      for (const inv of STRUCT_INVARIANTS.get(p.type.name)!) {
        // Every exit, not just the fall-through ones: a mutator that ends in `return true`
        // has no final env at all, and reading only those would have silently checked
        // nothing for exactly the functions most likely to break the invariant.
        const exits = [
          ...symResult.paths.map(pt => ({ conditions: pt.conditions, env: pt.env })),
          ...symResult.finalEnvs,
        ];
        const violations: string[] = [];
        for (const fe of exits) {
          const fieldEnv = new Map<string, string>();
          for (const f of fields) fieldEnv.set(f, fe.env.get(`${p.name}_${f}`) ?? `${p.name}_${f}`);
          const after = instantiateInvariant(inv, fieldEnv);
          violations.push(`(and true ${[...fe.conditions, `(not ${after})`].join(" ")})`);
        }
        if (violations.length === 0) continue;   // no completing path: nothing to maintain
        conditions.push({
          fn: fn.name,
          kind: "struct-invariant",
          invariantOf: p.type.name,
          description: `invariant of ${p.type.name} maintained by ${fn.name}: ${exprToSmt(inv.expr)}`,
          smtlib: [
            `; Struct invariant maintenance: ${p.name}: &mut ${p.type.name} in ${fn.name}`,
            `(set-logic ALL)`,
            allDecls,
            preAssumptions,
            `(assert ${violations.length === 1 ? violations[0] : `(or ${violations.join(" ")})`})`,
            `(check-sat)`,
          ].filter(Boolean).join("\n"),
        });
      }
    }

    // Termination. A self-recursive call is modelled by ASSUMING this function's own
    // `ensures` — that is induction, and induction over a recursion that may not terminate
    // proves anything. `decreases` supplies the well-founded measure the induction needs:
    // non-negative at entry, and strictly smaller at every self-call.
    for (const dec of decreases) {
      const atEntry = exprToSmt(dec.expr);
      const selfCalls = symResult.calls.filter(c => c.name === fn.name && c.args.length === fn.params.length);
      for (const call of selfCalls) {
        const subst = new Map<string, string>();
        fn.params.forEach((p, idx) => subst.set(p.name, call.args[idx]!));
        const atCall = exprToSmtWithEnv(dec.expr, subst, true);
        const guard = call.conditions.length > 0 ? `(assert (and true ${call.conditions.join(" ")}))` : "";
        conditions.push({
          fn: fn.name,
          kind: "termination",
          description: `recursion of ${fn.name} decreases: ${atCall} < ${atEntry} and ${atEntry} >= 0`,
          smtlib: [
            `; Termination measure for the self-call in ${fn.name}`,
            `(set-logic ALL)`,
            allDecls,
            preAssumptions,
            guard,
            `(assert (not (and (>= ${atEntry} 0) (< ${atCall} ${atEntry}))))`,
            `(check-sat)`,
          ].filter(Boolean).join("\n"),
        });
      }
      // A `decreases` on a function that never calls itself has nothing to discharge. Say so
      // rather than silently reporting a clause as proven that was never used for anything.
      if (selfCalls.length === 0) {
        conditions.push({
          fn: fn.name,
          kind: "termination",
          description: `decreases on ${fn.name} is vacuous: no self-recursive call was found`,
          smtlib: [
            `; Vacuous termination measure in ${fn.name}`,
            `(set-logic ALL)`,
            allDecls,
            preAssumptions,
            `(assert (not (>= ${atEntry} 0)))`,
            `(check-sat)`,
          ].filter(Boolean).join("\n"),
        });
      }
    }

    // Loop invariants, the two halves of the induction. Both are stated in the same
    // declaration block as everything else, so the fresh havoc constants they quantify over
    // are actually declared — the previous stub emitted a bare `(assert (not INV))` with no
    // declarations at all, which z3 rejected outright and std/smt reported as unknown.
    for (const loop of symResult.loops) {
      const entryCond = loop.entryConds.length > 0 ? `(assert (and true ${loop.entryConds.join(" ")}))` : "";
      for (const inv of loop.invariants) {
        // Establishment: the invariant has to hold on the way in, in the pre-loop state.
        // Emitted even when it will not translate — the marker makes it report `unknown`
        // with the reason. Skipping it (what this did before) hid an obligation the same
        // way the preservation half did, and an invariant whose two halves both vanish is
        // reported as a clean pass over a loop nothing checked.
        const atEntry = exprToSmtWithEnv(inv.expr, loop.entryEnv);
        conditions.push({
          fn: fn.name,
          kind: "loop-invariant",
          description: `loop invariant holds on entry in ${fn.name}: ${atEntry}`,
          smtlib: [
            `; Loop invariant establishment for ${fn.name}`,
            `(set-logic ALL)`,
            allDecls,
            preAssumptions,
            entryCond,
            `(assert (not ${atEntry}))`,
            `(check-sat)`,
          ].filter(Boolean).join("\n"),
        });
        loopCount++;
      }

      // Preservation: assuming every invariant and the guard, one pass through the body
      // has to re-establish them. Body paths that `return` leave the loop, so only the
      // fall-through environments have anything to preserve.
      const bodyRun = loop.bodyRun;
      const assumed = loop.invariants
        .map(inv => exprToSmtWithEnv(inv.expr, loop.havocEnv))
        .filter(s => !/UNSUPPORTED/.test(s));
      // A nested loop inside the body mints its own havoc constants; without these
      // declarations the preservation query would reference undeclared symbols.
      for (const inv of loop.invariants) {
        const violations: string[] = [];
        const nextIterationEnvs = [...bodyRun.finalEnvs, ...bodyRun.continueEnvs];
        let untranslatable = "";
        for (const fe of nextIterationEnvs) {
          // A for-in loop's binding is advanced by the loop form, not by the body, so the
          // state one iteration on is the body's exit state with that advance patched in.
          // Without it `invariant i <= n` over `for i in 0..n` would be asked to prove
          // itself about the SAME index it just assumed, which is trivially true and checks
          // nothing about the loop moving forward.
          const after = exprToSmtWithEnv(inv.expr, patched(fe.env, loop.nextPatch));
          if (/UNSUPPORTED/.test(after)) { untranslatable = after; break; }
          const conds = fe.conditions.length > 0 ? `(and true ${fe.conditions.join(" ")})` : "true";
          violations.push(`(and ${conds} (not ${after}))`);
        }
        // A body with no completing path (every route returns or breaks) has nothing to
        // preserve — vacuous, and correctly silent.
        if (!untranslatable && nextIterationEnvs.length === 0) continue;
        // FALSE PROOF otherwise. This used to `continue` when the post-iteration state
        // wouldn't translate, so the preservation obligation VANISHED and the invariant
        // was reported `proven` off its establishment VC alone:
        //
        //     while i < v.len  invariant total == 0  { total = total + v[i]; i = i + 1 }
        //
        // came back "1 condition, proven: 1, unknown: 0" for a loop whose invariant is
        // false on the first iteration — `v[i]` is an IndexAccess the translator has no
        // rule for, and the obligation that would have caught it was dropped rather than
        // reported. Emitting the marker turns it into `unknown` with the reason attached,
        // which is the same discipline the rest of the translator follows: silence must
        // never render as a checkmark.
        const violated = untranslatable
          ? `(not ${untranslatable})`
          : (violations.length === 1 ? violations[0] : `(or ${violations.join(" ")})`);
        const guardAssume = !loop.guard || /UNSUPPORTED/.test(loop.guard) ? "" : `(assert ${loop.guard})`;
        conditions.push({
          fn: fn.name,
          kind: "loop-invariant",
          description: `loop invariant preserved by body in ${fn.name}: ${exprToSmt(inv.expr)}`,
          smtlib: [
            `; Loop invariant preservation for ${fn.name}`,
            `(set-logic ALL)`,
            allDecls,
            preAssumptions,
            ...assumed.map(a => `(assert ${a})`),
            guardAssume,
            `(assert ${violated})`,
            `(check-sat)`,
          ].filter(Boolean).join("\n"),
        });
        loopCount++;
      }

      // A loop `decreases` is the same well-founded-measure obligation as the recursive
      // one: non-negative while the loop is still running, and strictly smaller after one
      // pass. Unlike the function-level measure this is not needed for soundness — a
      // non-terminating loop makes the postcondition vacuously true rather than provable
      // from nothing — so it buys total correctness, not the absence of a false proof.
      const guardForVariant = !loop.guard || /UNSUPPORTED/.test(loop.guard) ? "" : `(assert ${loop.guard})`;
      for (const dec of loop.variants) {
        const before = exprToSmtWithEnv(dec.expr, loop.havocEnv);
        const nextIterationEnvs = [...bodyRun.finalEnvs, ...bodyRun.continueEnvs];
        if (nextIterationEnvs.length === 0) continue;
        const violations = nextIterationEnvs.map(fe => {
          const after = exprToSmtWithEnv(dec.expr, patched(fe.env, loop.nextPatch));
          return `(and true ${[...fe.conditions, `(not (and (>= ${before} 0) (< ${after} ${before})))`].join(" ")})`;
        });
        conditions.push({
          fn: fn.name,
          kind: "termination",
          description: `loop measure decreases in ${fn.name}: ${exprToSmt(dec.expr)}`,
          smtlib: [
            `; Loop termination measure for ${fn.name}`,
            `(set-logic ALL)`,
            allDecls,
            preAssumptions,
            ...assumed.map(a => `(assert ${a})`),
            guardForVariant,
            `(assert ${violations.length === 1 ? violations[0] : `(or ${violations.join(" ")})`})`,
            `(check-sat)`,
          ].filter(Boolean).join("\n"),
        });
      }
    }

    fillCallModel(conditions, vcStart);
    if (assumedInvariants.size > 0) {
      for (let i = vcStart; i < conditions.length; i++) {
        // The type's own obligations are not conditional on themselves.
        if (conditions[i]!.invariantOf) continue;
        conditions[i]!.assumesInvariants = [...assumedInvariants];
      }
    }
    CALL_MODEL = null;
  }

  return {
    conditions,
    stats: {
      functions: allFns.filter(f => f.contracts.length > 0 || hasLoopInvariants(f.body)).length,
      contracts: contractCount,
      loops: loopCount,
    },
  };
}

// An environment with a loop form's own advance applied on top.
function patched(env: Map<string, string>, patch: Map<string, string> | undefined): Map<string, string> {
  if (!patch || patch.size === 0) return env;
  const out = new Map(env);
  for (const [k, v] of patch) out.set(k, v);
  return out;
}

function hasLoopInvariants(stmts: Stmt[]): boolean {
  for (const stmt of stmts as any[]) {
    if ((stmt.kind === "WhileStmt" || stmt.kind === "ForInStmt") && stmt.invariants?.length > 0) return true;
    for (const key of ["body", "thenBody", "elseBody"]) {
      if (Array.isArray(stmt[key]) && hasLoopInvariants(stmt[key])) return true;
    }
    if (Array.isArray(stmt.arms) && stmt.arms.some((a: any) => hasLoopInvariants(a.body))) return true;
  }
  return false;
}

function exprToSmt(expr: Expr): string {
  switch (expr.kind) {
    case "IntLit": return expr.value.toString();
    case "FloatLit": return floatLitToSmt(expr.value);
    case "BoolLit": return expr.value ? "true" : "false";
    case "Ident":
      if (expr.name === "result") return "result";
      return GLOBAL_CONST_SMT.get(expr.name) ?? expr.name;
    case "CastExpr":
      return castToSmt(exprToSmt(expr.operand), expr.targetType?.name ?? "i64");
    case "BinOp": {
      const left = exprToSmt(expr.left);
      const bit = bitOpToSmt(expr.op, left, expr.right);
      if (bit) return bit;
      const right = exprToSmt(expr.right);
      const rdiv = realDivToSmt(expr.op, left, right);
      if (rdiv) return rdiv;
      if (expr.op === "/" || expr.op === "%") {
        const t = truncDivToSmt(expr.op, left, right, resolveConstNum(expr.right));
        if (t) return t;
      }
      const op = binOpToSmt(expr.op);
      return `(${op} ${left} ${right})`;
    }
    case "UnaryOp":
      if (expr.op === "!") return `(not ${exprToSmt(expr.operand)})`;
      if (expr.op === "-") return `(- ${exprToSmt(expr.operand)})`;
      return `(UNSUPPORTED_UNARY ${expr.op})`;
    case "Call": {
      if (isOldCall(expr)) {
        return OLD_ENV ? exprToSmtWithEnv((expr as any).args[0]!, OLD_ENV) : `(UNSUPPORTED old)`;
      }
      if (typeof expr.func === "string") {
        const modeled = modelCall(expr, expr.func, expr.args);
        if (modeled) return modeled;
        return `(UNSUPPORTED_CALL ${expr.func})`;
      }
      return `(UNSUPPORTED Call)`;
    }
    case "FieldAccess": {
      const flat = flattenFieldAccess(expr);
      if (flat) return flat;
      return `(${exprToSmt(expr.object)}.${expr.field})`;
    }
    case "IfExpr": {
      const t = ifExprArm(expr.thenBody), e = ifExprArm(expr.elseBody);
      if (t && e) return `(ite ${exprToSmt(expr.cond)} ${exprToSmt(t)} ${exprToSmt(e)})`;
      return `(UNSUPPORTED IfExpr)`;
    }
    case "MethodCall": {
      // `.len()` is the same quantity as the `.len` field, just spelled as a call — milo's
      // own std uses the field, milojs uses the method. Everything else has no modular
      // model yet (no receiver encoding), and emitting the bare application would hand the
      // solver an undeclared symbol.
      const asLen = lenMethodAsField(expr);
      if (asLen) return exprToSmt(asLen);
      return `(UNSUPPORTED_METHOD ${expr.method})`;
    }
    default:
      return `(UNSUPPORTED ${expr.kind})`;
  }
}

function binOpToSmt(op: string): string {
  switch (op) {
    case "+": return "+";
    case "-": return "-";
    case "*": return "*";
    // Handled by truncDivToSmt, which needs the operand strings; reaching this arm means
    // the caller did not route through it.
    case "/": return "UNSUPPORTED_OP_div";
    case "%": return "UNSUPPORTED_OP_mod";
    case "==": return "=";
    case "!=": return "distinct";
    case "<": return "<";
    case ">": return ">";
    case "<=": return "<=";
    case ">=": return ">=";
    case "&&": return "and";
    case "||": return "or";
    default: return `UNSUPPORTED_OP_${op}`;
  }
}

// An integer type's real range, as an SMT assumption. Every int lowers to an unbounded
// mathematical `Int`, so without this the solver is free to pick i32 = -10^18 and
// "refute" a contract like `requires a >= -2147483648` that no i32 can actually violate.
// It is an assumption about the inputs, so it only ever makes a proof easier — it cannot
// turn a proven VC into a failing one.
// i64/u64 are deliberately absent, and it is a usability call, not a soundness one:
// std/smt's Fourier-Motzkin multiplies constants, so bounds at ±2^63 overflow during
// elimination. That used to yield a FALSE PROOF (unsat for a satisfiable formula); it now
// yields `unknown`, because combine() detects the overflow — but `unknown` for every i64
// contract is worse than no range at all, since the refutations go with it. Verified: with
// i64 ranges on, a genuinely broken call reports `unknown` instead of its counterexample.
// The narrow types carry the weight anyway — they are what the solver cannot otherwise
// know. Retire this when the solver's arithmetic is widened (backlog).
const INT_RANGES: Record<string, [string, string]> = {
  i8: ["(- 128)", "127"],
  i16: ["(- 32768)", "32767"],
  i32: ["(- 2147483648)", "2147483647"],
  u8: ["0", "255"],
  u16: ["0", "65535"],
  u32: ["0", "4294967295"],
};

function intRangeAssumption(name: string, typeName: string | undefined): string | null {
  const r = INT_RANGES[typeName ?? ""];
  return r ? `(assert (and (>= ${name} ${r[0]}) (<= ${name} ${r[1]})))` : null;
}

function miloTypeToSmt(name: string): string {
  switch (name) {
    case "i8": case "i16": case "i32": case "i64":
    case "u8": case "u16": case "u32": case "u64":
      return "Int";
    case "f32": case "f64":
      return "Real";
    case "bool":
      return "Bool";
    default:
      return "Int";
  }
}

export interface SolverResult {
  vc: VerificationCondition;
  status: "proven" | "failed" | "unknown" | "error";
  detail?: string;
}

export interface ProveResult {
  results: SolverResult[];
  proven: number;
  failed: number;
  unknown: number;
  errors: number;
}

// Invoke z3 on all verification conditions and return proof results.
// What the SMT translator couldn't express, read back out of the generated VC.
//
// exprToSmt emits an `UNSUPPORTED` marker rather than dropping the term — which is what
// keeps the prover sound (the marker poisons the formula, so nothing gets proven by
// accident). But the marker then reaches the solver as an undeclared symbol, and both
// backends blame themselves for it: std/smt reports "outside linear fragment" about a
// perfectly linear contract, and z3 emits a raw parse error naming a constant the user
// never wrote. Neither points at the actual cause, so both send you off optimizing a
// contract that was never the problem.
export function untranslatable(smtlib: string): string[] {
  const out = new Set<string>();
  for (const m of smtlib.matchAll(/\(UNSUPPORTED (\w+)\)/g)) out.add(`${m[1]} expressions`);
  for (const m of smtlib.matchAll(/\(UNSUPPORTED_UNARY (\S+?)\)/g)) out.add(`unary '${m[1]}'`);
  for (const m of smtlib.matchAll(/UNSUPPORTED_OP_(\S+?)[\s)]/g)) out.add(`operator '${m[1]}'`);
  for (const m of smtlib.matchAll(/\(UNSUPPORTED_CALL (\S+?)\)/g)) out.add(`calls to '${m[1]}' (it declares no 'ensures' to model its result by)`);
  for (const m of smtlib.matchAll(/\(UNSUPPORTED_METHOD (\S+?)\)/g)) out.add(`method calls ('.${m[1]}')`);
  return [...out];
}

// Which `proven` verdicts are only conditionally proven: they assumed a callee's `ensures`
// that the same run could not establish. The assumption may still be true — `rd`'s "every
// read yields a byte" is true but sits behind an IndexAccess the translator cannot model —
// but a reader deserves to know the difference between a proof and a proof-modulo-an-
// unchecked-claim. A callee with no postcondition VC at all (not analyzed in this run,
// e.g. filtered out by --onlyFile) counts as unestablished for the same reason.
export function conditionalProofs(pr: ProveResult): Map<SolverResult, string[]> {
  const postconditionsByFn = new Map<string, SolverResult[]>();
  for (const r of pr.results) {
    if (r.vc.kind !== "postcondition") continue;
    const list = postconditionsByFn.get(r.vc.fn) ?? [];
    list.push(r);
    postconditionsByFn.set(r.vc.fn, list);
  }
  const established = (fn: string) => {
    const posts = postconditionsByFn.get(fn);
    return posts !== undefined && posts.length > 0 && posts.every(p => p.status === "proven");
  };
  // A SELF-recursive call is assumed the same way, and there the assumption is induction:
  // sound only if the recursion bottoms out. That is what `decreases` establishes, so a
  // proof that leaned on itself without a discharged measure is conditional on termination.
  const terminationByFn = new Map<string, SolverResult[]>();
  for (const r of pr.results) {
    if (r.vc.kind !== "termination") continue;
    const list = terminationByFn.get(r.vc.fn) ?? [];
    list.push(r);
    terminationByFn.set(r.vc.fn, list);
  }
  const terminates = (fn: string) => {
    const t = terminationByFn.get(fn);
    return t !== undefined && t.length > 0 && t.every(x => x.status === "proven");
  };
  // A struct invariant is assumed at every use site, so it is only as good as the
  // construction/maintenance obligations discharged for that type across this run.
  const invariantResults = new Map<string, SolverResult[]>();
  for (const r of pr.results) {
    if (!r.vc.invariantOf) continue;
    const list = invariantResults.get(r.vc.invariantOf) ?? [];
    list.push(r);
    invariantResults.set(r.vc.invariantOf, list);
  }
  const invariantHolds = (name: string) => {
    const rs = invariantResults.get(name);
    return rs !== undefined && rs.length > 0 && rs.every(x => x.status === "proven");
  };
  const out = new Map<SolverResult, string[]>();
  for (const r of pr.results) {
    if (r.status !== "proven") continue;
    const weak = (r.vc.assumes ?? []).filter(fn => (fn === r.vc.fn ? !terminates(fn) : !established(fn)));
    const weakInv = (r.vc.assumesInvariants ?? [])
      .filter(name => !invariantHolds(name))
      .map(name => `${name}'s invariant`);
    if (weak.length || weakInv.length) out.set(r, [...weak, ...weakInv]);
  }
  return out;
}

// Solver diagnostics land in a one-line-per-VC report; a raw multi-line message would
// interleave with the next verdict.
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function untranslatableDetail(kinds: string[]): string {
  return `the SMT translator has no rule for ${kinds.join(", ")} — the contract is not the problem`;
}

export function proveWithZ3(result: VerifyResult): ProveResult {
  const { spawnSync } = require("child_process") as typeof import("child_process");

  // check z3 is available
  const which = spawnSync("which", ["z3"], { encoding: "utf-8" });
  if (which.status !== 0) {
    return {
      results: result.conditions.map(vc => ({ vc, status: "error" as const, detail: "z3 not found in PATH" })),
      proven: 0, failed: 0, unknown: 0, errors: result.conditions.length,
    };
  }

  const results: SolverResult[] = [];
  for (const vc of result.conditions) {
    // Don't hand z3 a formula containing a marker it can't parse — it would come back as
    // an opaque parse error about a symbol the user never wrote.
    const cant = untranslatable(vc.smtlib);
    if (cant.length) { results.push({ vc, status: "unknown", detail: untranslatableDetail(cant) }); continue; }
    const proc = spawnSync("z3", ["-in", "-T:5"], {
      input: vc.smtlib,
      encoding: "utf-8",
      timeout: 10000,
    });

    // z3 keeps going after a bad command, so a rejected query prints `(error ...)` AND a
    // verdict for the remaining assertions. That verdict describes a formula z3 didn't
    // fully accept, so an error anywhere invalidates the whole run — and its text must be
    // flattened to one line or it breaks the report layout.
    const output = (proc.stdout ?? "").trim();
    const lines = output.split("\n").map(l => l.trim()).filter(Boolean);
    const errLine = lines.find(l => l.startsWith("(error"));
    if (errLine) {
      results.push({ vc, status: "error", detail: oneLine(errLine) });
    } else if (output === "unsat") {
      // negation is unsat → contract always holds
      results.push({ vc, status: "proven" });
    } else if (output === "sat") {
      // negation is sat → contract can be violated
      results.push({ vc, status: "failed", detail: "counterexample exists" });
    } else if (output === "unknown") {
      results.push({ vc, status: "unknown", detail: "solver could not decide" });
    } else {
      results.push({ vc, status: "error", detail: oneLine(output || proc.stderr || "z3 produced no output") });
    }
  }

  return {
    results,
    proven: results.filter(r => r.status === "proven").length,
    failed: results.filter(r => r.status === "failed").length,
    unknown: results.filter(r => r.status === "unknown").length,
    errors: results.filter(r => r.status === "error").length,
  };
}

export function formatProveReport(pr: ProveResult): string {
  const lines: string[] = [];
  lines.push(`verification: ${pr.results.length} conditions`);
  lines.push(`  proven: ${pr.proven}  failed: ${pr.failed}  unknown: ${pr.unknown}  errors: ${pr.errors}`);
  lines.push("");

  const conditional = conditionalProofs(pr);
  for (const r of pr.results) {
    const icon = r.status === "proven" ? "✓" : r.status === "failed" ? "✗" : "?";
    const weak = conditional.get(r);
    const selfAssumed = weak?.includes(r.vc.fn);
    const invariants = weak?.filter(f => f.endsWith("'s invariant")) ?? [];
    const others = weak?.filter(f => f !== r.vc.fn && !f.endsWith("'s invariant")) ?? [];
    // Two different gaps read the same in the tally but not to a reader: a function with no
    // `decreases` at all was never asked to terminate, while one whose measure came back
    // unproven was asked and could not answer.
    const hasMeasure = pr.results.some(x => x.vc.kind === "termination" && x.vc.fn === r.vc.fn);
    const termNote = hasMeasure
      ? `that ${r.vc.fn}'s recursion terminates, which its 'decreases' measure did not establish`
      : `that ${r.vc.fn}'s recursion reaches a base case, which nothing proved (add a 'decreases' clause)`;
    const parts: string[] = [];
    if (others.length) parts.push(`${others.join(", ")}, whose own postcondition is not established`);
    if (selfAssumed) parts.push(termNote);
    if (invariants.length) parts.push(`${invariants.join(", ")}, which this run did not establish at every construction and mutation`);
    const note = parts.length === 0 ? "" : ` — conditional: assumes ${parts.join("; and ")}`;
    lines.push(`  ${icon} [${r.vc.kind}] ${r.vc.fn}: ${r.status}${r.detail ? ` — ${r.detail}` : ""}${note}`);
  }
  if (conditional.size > 0) {
    lines.push("");
    lines.push(`  ${conditional.size} of ${pr.proven} proofs are conditional on something this run did not establish.`);
  }

  return lines.join("\n");
}

export function formatVerifyReport(result: VerifyResult): string {
  const lines: string[] = [];
  lines.push(`verification conditions: ${result.conditions.length}`);
  lines.push(`  functions with contracts: ${result.stats.functions}`);
  lines.push(`  contract clauses: ${result.stats.contracts}`);
  lines.push(`  loop invariants: ${result.stats.loops}`);
  lines.push("");

  for (const vc of result.conditions) {
    lines.push(`── ${vc.kind} ── ${vc.fn} ──`);
    lines.push(vc.description);
    lines.push(vc.smtlib);
    lines.push("");
  }

  return lines.join("\n");
}

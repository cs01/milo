# milox

A small dynamically-typed scripting language, written in Milo, whose entire
point is one decision: **every runtime value is exactly 8 bytes.**

```
$ milox dynamic
[1, "two", true, nil, [3, 4]]
5
42
now i am a string
["now i am a string", "now i am a string"]
[<fn double>, <fn shout>]
42
hey!
100
dynamic dispatch!
[[1, 2], [3, [99, 5]]]
16
{"name": "goblin", "hp": 12, "tags": ["cave", "fast"]}
12
{"name": "goblin", "hp": 3, "tags": ["cave", "fast"], "state": "flee"}
["name", "hp", "tags", "state"]
4
true
nil
{}
[{"n": "a"}, {"n": "z"}]
{"grid": [[1, 2], [9, 4]]}
```

Heterogeneous lists, variables that change type, functions as values, calling a
function out of a list, calling the function another function returned, mutating
a nested list in place, dictionaries that keep the order you wrote them in.
Written in a language with no GC, no reference counting, and no pointers in safe
code.

## Try it

```bash
milo run examples/languages/milox/main.milo -- demo      # a tour of the language
milo run examples/languages/milox/main.milo -- dynamic   # the program above
milo run examples/languages/milox/main.milo -- embed     # milox inside a host program
milo run examples/languages/milox/main.milo -- gc-bug    # a deliberately broken collector
milo run examples/languages/milox/main.milo -- forge     # 2M forged object references
milo run examples/languages/milox/main.milo -- scripts/dynamic.milox --disasm
```

## The value

A double is stored as itself. Everything else hides in the payload of a quiet
NaN, the one f64 bit pattern nobody computes with. The obvious alternative,

```milo
enum Value { Num(f64), Nil, Bool(bool), Obj(Handle<Obj>) }
```

lowers to `%V = type { i32, [2 x i64] }` — **24 bytes**, because the tag cannot
overlap the widest payload. NaN-boxing folds the tag into bits the payload was
never using:

```
  double        any bit pattern where (bits & QNAN) != QNAN
  nil/true/false  QNAN | 1 | 2 | 3
  heap object   SIGN | QNAN | (generation << 24) | index
```

Hardware NaN from `0.0/0.0` is `0x7ff8_0000_0000_0000`, which clears bit 50, so
real NaN and both infinities survive as numbers. Only one quiet-NaN encoding is
spent.

## The part that is not like every other nan-boxed VM

C implementations of this trick pack a **raw pointer** into the 48 payload bits.
milox packs an **arena handle** — a slot index and a generation counter. Unboxing
goes through `arenaWith`, which checks four things before it touches memory:

```
if h.arenaId != a.id                              return None   // wrong heap
if idx < 0                                        return None
if idx >= a.data.len                              return None   // bounds
if a.gens[idx] <= 0 || a.gens[idx] != h.generation return None   // dead or reused slot
return Some(f(a.data[idx]))
```

Two structural details make that airtight rather than merely careful:

- **The arena id is injected by the heap, never carried in the box.** A value
  cannot name a different arena, because that field is filled from `self.id`.
- **Boxing fails closed on overflow.** 50 payload bits, split 24 index / 26
  generation. A generation that does not fit aborts rather than truncating.
  Truncating is the one thing that could let slot reuse alias a stale handle
  back into validity, which is exactly what the counter exists to prevent.

So there is no 64-bit pattern that dereferences freed memory:

```
$ milox forge
forged 2000000 object boxes from random 64-bit payloads
  dereferenced: 0
  rejected by the generation check: 2000000
  the real object is untouched: true
```

### This is not hypothetical

JavaScriptCore, which powers Bun, nan-boxes too. From its own header:

```c
// The canonical quiet NaN (PureNaN.h). This is the only NaN that is safe to
// NaN-box: any other payload can collide with the tag ranges above and decode
// as a cell pointer, an immediate, or an Int32 instead of a double.
#define PureNaN 0x7ff8000000000000ll
```

A NaN with the wrong payload **decodes as a pointer and gets dereferenced**. The
defense is a `purifyNaN()` discipline applied at every boundary where a double
arrives from native code — and in June 2026 Bun shipped a fix for a boundary
that had been missed (`ffi, napi: purify NaNs before NaN-boxing doubles from
native code`, upstream `179978a6f9`):

> `bun:ffi` NaN-boxes native doubles without purifying them, so a well-typed C
> function returning an `f64` can hand JavaScript an arbitrary forged JSValue.
> The NaN payload picks what JS receives: `true`, `undefined`, an Int32, or a
> cell pointer whose address comes from native data (type confusion and an
> arbitrary read).

That bug cannot be written here. The payload names an arena slot, and the arena
checks it.

## A garbage collector you are allowed to get wrong

milox has a mark-sweep collector. `milox gc-bug` runs it with a planted defect:
the sweep frees one **reachable** object.

```
$ milox gc-bug
[line 8] runtime error: indexed a dangling object reference (the box outlived its object)
--- 6015 instructions, 19 allocations, 6 collections, 20 live objects, 1 dangling references caught
```

A line number, at the instruction that touched it. The identical bug in a C
nan-boxed VM is a use-after-free that surfaces somewhere else entirely, as
corrupted data or a crash with no relationship to its cause.

This is the property worth having. Writing a collector is hard, and the
consequence of getting it wrong is normally unbounded. Here it is a caught
dangling reference at the point of use.

## Embedding

```
$ milox embed
one host, three scripts, no recompile between them

  cautious rule, wounded (hp 12)
    state = flee
    speed = 6
    log   = ["goblin", "flee", 12, 6]

  cautious rule, healthy (hp 80)
    state = attack
    speed = 3
    log   = ["goblin", "attack", 80, 3]

  broken rule reaches past the end of a list
    [line 4] runtime error: list index 9999 out of range
    state = about to reach past the end
    speed = 3
```

The host seeds globals, the script computes, the host reads them back — and a
script that faults leaves host state readable. The surface is four methods:

```milo
vm.defineGlobalNumber(name, d)
vm.defineGlobalString(name, s)
vm.defineGlobalBool(name, b)
vm.getGlobal(name): Option<Value>
```

Everything crossing that boundary is a `Value`: 8 bytes, and for heap values an
index plus a generation. There is no address in it. A script cannot hand the
host a pointer and the host cannot hand the script one — which is the guarantee
an embedded C scripting VM structurally cannot offer, and the reason every one
of them is a source of host memory corruption.

## The language

```
var x = 1;                      // global at top level, local inside a block
fn add(a, b) { return a + b; }  // top-level only, no closures
print expr;
if (cond) stmt else stmt
while (cond) stmt
{ ... }                         // block, opens a scope
```

Values: numbers (f64), strings, `true`, `false`, `nil`, lists, dictionaries.
Operators `+ - * / == != < > <= >= ! and or`, `+` also concatenates strings.
Lists are `[a, b, c]`, indexed `xs[i]`, assigned `xs[i] = v`, measured
`len(xs)`. Functions are values: put them in a list, return them, call the
result. `//` comments.

Dictionaries are string-keyed and **insertion-ordered**:

```
var d = {"hp": 12, "state": "flee"};   // trailing comma allowed; {} is empty
print d["hp"];                          // 12
print d["gold"];                        // nil — a missing key reads nil
d["hp"] = 3;                            // update, keeps its position
d["mana"] = 50;                         // insert, goes to the end
print len(d);                           // 3
print keys(d);                          // ["hp", "state", "mana"]
print has(d, "mana");                   // true
print d;                                // {"hp": 3, "state": "flee", "mana": 50}
```

A `{` in expression position is a dictionary literal; a `{` in statement
position is still a block, and the two never compete because the expression
parser is the only thing that sees the literal form. Keys are evaluated
expressions that must be strings **at runtime** — `{1: "one"}` is the runtime
error `dictionary key must be a string`, the same as `d[1]`. Values are any
expression, so dicts and lists nest either way around and a nested element is
assignable through the index chain (`world["grid"][1][0] = 9`).

Entries are two parallel vectors with linear lookup rather than a hash table:
that is what makes `keys(d)` and `print d` deterministic, and at demo scale it
is also the faster shape. `keys` and `has` are reserved call forms compiled to
one opcode each, exactly like `len`, so the VM never has to model a callable
native function.

## Layout

| file | what |
|---|---|
| `value.milo` | the 8-byte nan-box |
| `heap.milo` | one generational arena for every heap object, plus mark-sweep |
| `lexer.milo` | tokens |
| `compiler.milo` | single-pass Pratt compiler, source straight to bytecode |
| `chunk.milo` | opcodes and the instruction stream |
| `function.milo` | a compiled function |
| `vm.milo` | the stack machine, and the embedding API |
| `disasm.milo` | `--disasm`, so jump arithmetic can be checked by eye |
| `runner.milo` | compile-and-run, which is also the whole embedding recipe |
| `demos.milo` | the four demonstrations |
| `main.milo` | the command line, and nothing else |
| `scripts/*.milox` | every milox program used above, as real files, `@embedFile`d into the binary |

Architecture is deliberately clox-shaped (*Crafting Interpreters*, Part III) so
the comparison with the reference C implementation is apples-to-apples: same
pipeline, one representation decision changed.

## What writing this taught us about Milo

Six things surfaced, recorded here because an example that only shows off is
worth less than one that reports.

1. **`pub` is rejected inside `impl` blocks.** Mark the type `pub`; methods are
   bare `fn`.
2. **A generic static method cannot infer its parameter from an argument.**
   `fn obj<T>(h: Handle<T>): Value` fails every call with `expected Handle_T,
   got Handle_Obj`. Boxing takes `(index, generation)` instead — which decoupled
   the box from the heap's element type, so this one ended up an improvement.
3. **A closure cannot capture `self`.** The value formatter pulls plain data out
   of the borrow (a kind tag, a string, a function index, the elements) and does
   everything VM-dependent afterward.
4. **`let m = v[i]` on a `Vec` of non-Copy elements deep-copies, but
   `v[i].field.field[j]` projection does not.** The penalty is on *binding* the
   element, not on reaching through it. `compiler.milo` stores its token stream
   as three parallel arrays for this reason; `vm.milo` indexes
   `functions[fi].chunk.code[ip]` directly with no copy.
5. **Enum payloads bind immutably even through `&mut`.** `checker.ts` pins the
   binding to `{ tag: "ref", mutable: false }` unconditionally, so matching on a
   `&mut Obj` still yields `&Obj` and a payload cannot be mutated in place. The
   workaround is move-out / mutate / move-back through `arenaModify`, which is
   O(1) — see `heapUpdate` in `heap.milo`.
6. **The closure-escape analysis has a false positive on method forwarding.**
   Two wrappers with identical semantics:

   ```milo
   fn viaFreeFn(a: &mut Arena<O>, i: i64, f: (O) => O): bool { return arenaModify(a, a.handles()[i], f) }  // ok
   fn viaMethod(a: &mut Arena<O>, i: i64, f: (O) => O): bool { return a.modify(a.handles()[i], f) }        // rejected
   ```

   `retainsParam` (`src/checker.ts`) forwards a closure parameter through a
   plain call but not through a `MethodCall`, so the method form rejects every
   caller whose closure captures a local. Fail-closed, so not unsound — it
   rejects safe code rather than accepting unsafe code — but it is a wall you
   hit the moment you wrap a std higher-order API.

Nothing in milox uses `unsafe`. The only `unsafe` in the whole stack is
`std/binary`'s f64↔u64 pun, which is size-preserving and cannot manufacture an
address.

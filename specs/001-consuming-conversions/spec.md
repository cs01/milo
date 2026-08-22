# Feature Specification: Consuming Conversions (shatter/weld, seal/span, freeze)

**Feature Branch**: `main` (repo convention: no feature branches)

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "read and implement everything in /tmp/milomemsafe"

**Source material**: `ownership-fission.md`, `seal-span.md`, `frozen-pools.md`, `blog-outline.md`,
`README.md` (benchmark scorecard) and 8 prototype programs, delivered as
`~/Downloads/:tmp:milo_memsafe.zip` (original path `/tmp/milo_memsafe`), unpacked to the session
scratchpad.

## Overview

`docs/residue-vs-rust.md` names three workloads where Rust genuinely wins because Milo's axiom
(second-class references, no lifetimes) forbids the Rust answer:

1. compile-time rejection of stale stored references,
2. in-place shared-memory parallelism,
3. stored zero-copy.

The source material proposes one idea that takes the dominant workload out of each: **a consuming
move into a type on which the dangerous operation does not exist.** Where Rust proves a property of
a reference, Milo removes the operations that could violate the property, and the already-shipped
move checker proves the removal.

| Residue | Rust proves | Milo removes | Mechanism |
|---|---|---|---|
| #2 aliasing | disjoint `&mut` borrows | aliasing (ownership divides) | `shatter` / `weld` |
| #3 invalidation | borrow outlives referent | mutation (no mutating method exists) | `seal` + `Span` |
| #1 staleness | stale stored reference | removal (no `free`/`clear` exists) | `freeze` |

All three are standard-library data structures. None requires a new language rule.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build-then-read graphs with infallible lookup (Priority: P1)

A Milo programmer builds a symbol table, AST, config tree, or scene graph in an arena during a build
phase, then only reads it. Today every read returns `Option<T>` and must be unwrapped at every call
site, even though nothing can free a slot after the build ends. The programmer calls one method to
end the build phase; from then on lookups return the value directly and staleness is not
representable. Touching the old arena binding afterwards fails to compile.

**Why this priority**: Smallest change, no threads, no new shared-ownership machinery, and it
delivers standalone value the day it lands: it removes `Option` plumbing from the majority pool
shape and closes the common case of residue #1. It is the lowest-risk demonstration that the whole
thesis works, so it de-risks the other two stories.

**Independent Test**: Port one existing arena-using program (an example or a std consumer) to end
its build phase with the new call, confirm the `Option` unwrapping disappears, confirm lookups still
produce identical output, and confirm a use of the old binding is rejected at compile time.

**Acceptance Scenarios**:

1. **Given** an arena holding allocated values and handles minted from it, **When** the programmer
   ends the build phase and looks up a handle minted before that point, **Then** the value is
   returned directly with no optional wrapper and no failure path.
2. **Given** an arena whose build phase has ended, **When** source code allocates into, frees from,
   clears, or otherwise mutates the original arena binding, **Then** compilation fails with a
   diagnostic naming the moved variable and its source location.
3. **Given** a read-only arena, **When** a handle minted from a *different* arena is looked up,
   **Then** the program fails deterministically with a named error, never with undefined behaviour
   or a silently wrong value.
4. **Given** a read-only arena holding values that have destructors, **When** it is dropped,
   **Then** every element destructor runs exactly once and a memory-error sanitizer run reports
   nothing.

---

### User Story 2 - Keep views into an input buffer without copying (Priority: P2)

A Milo programmer writes a parser, lexer, or deserializer that keeps many small pieces of a large
input buffer: token text, JSON string values, header names. Today the choices are to copy every
piece into an owned string (allocation per piece) or to store offset pairs by convention, which
nothing prevents from being invalidated when the buffer changes. The programmer instead converts
the input buffer into a read-only buffer with one call, then stores plain offset-and-length values
freely in structs, vectors, and maps, resolving them against the buffer only when the bytes are
needed. Any attempt to mutate the buffer afterwards does not compile, because no mutating operation
exists on the converted type.

**Why this priority**: Larger measured win than Story 1 and it unlocks whole program shapes
(zero-copy parsers), but it introduces shared ownership across tasks and threads, so it carries more
risk than Story 1 and should follow it.

**Independent Test**: Rewrite the delivered JSON-scanning benchmark against the shipped read-only
buffer type instead of the prototype, confirm identical checksums against the copying version, and
confirm the allocation count and peak memory drop to the levels recorded in the source material.

**Acceptance Scenarios**:

1. **Given** a byte buffer converted to a read-only buffer, **When** source code attempts to write
   to, append to, resize, or otherwise mutate it, **Then** compilation fails because no such
   operation is offered by the type.
2. **Given** a read-only buffer and offsets stored in a struct that outlives the enclosing
   expression, **When** the offsets are resolved, **Then** the correct bytes are produced with no
   copy and no allocation.
3. **Given** offsets whose range falls outside the buffer, **When** they are resolved, **Then** the
   program fails deterministically with a named bounds error, never with undefined behaviour.
4. **Given** a read-only buffer shared with several concurrently running tasks or threads, **When**
   they all read from it simultaneously, **Then** every reader observes the same bytes and a
   thread-error sanitizer run reports nothing.
5. **Given** a read-only buffer with no other owners alive, **When** the programmer converts it back
   to a mutable buffer, **Then** the original allocation is returned unchanged and no copy is made;
   **When** other owners are alive, **Then** a named error is returned rather than a silent copy.

---

### User Story 3 - Transform a large buffer in place across cores (Priority: P3)

A Milo programmer has a large array and wants to apply an elementwise transform across several
cores. Today the only safe route hands each worker its own copy, so a job that should take
milliseconds pays a mandatory copy in both time and peak memory. Instead the programmer divides the
array's *ownership* into disjoint windows, hands each window to a worker as an ordinary moved value,
and reassembles the original allocation when the workers finish. No reference crosses a thread; no
two windows overlap; the original binding is dead by move.

**Why this priority**: The largest measured win and the headline claim, but it carries the biggest
unsafe seam (cross-thread sends, a shared control block, and a drop path that must be correct for
every partial-failure ordering), so it lands last of the three.

**Independent Test**: Rewrite the delivered parallel-transform benchmark against the shipped windows
type instead of the raw-pointer prototype, confirm the checksum matches the sequential version, and
confirm peak memory no longer exceeds the sequential baseline.

**Acceptance Scenarios**:

1. **Given** an array divided into N windows, **When** N workers each transform their own window in
   place and the windows are reassembled, **Then** the result is identical to the sequential
   transform and peak memory does not exceed the sequential baseline by more than 5%.
2. **Given** an array that has been divided, **When** source code uses the original array binding,
   **Then** compilation fails with a diagnostic naming the moved variable.
3. **Given** a set of windows with one missing, or mixing windows from two different divisions,
   **When** reassembly is attempted, **Then** a named error is returned deterministically and no
   memory is corrupted, freed twice, or leaked.
4. **Given** windows that are dropped rather than reassembled, **When** the last one is dropped,
   **Then** the underlying allocation is released exactly once, every element destructor in each
   window's own range runs exactly once, and a memory-error sanitizer run reports nothing.
5. **Given** a window handed to a worker, **When** source code attempts to capture the same window
   in a second worker, **Then** compilation fails with a diagnostic naming the moved variable.
6. **Given** an index outside a window's own range, **When** it is read or written, **Then** the
   program fails deterministically with a bounds error, never reaching a neighbouring window's
   elements.

---

### User Story 4 - Trust the project's own honesty about what it cannot do (Priority: P4)

A prospective user, or a reviewer weighing Milo against Rust, reads the project's own account of
where Rust genuinely wins. After this work, that account must state exactly which workloads moved
out of the residue, which remain, and what each remaining one costs, with every published number
reproducible from a command in the repository.

**Why this priority**: It carries no code, but it is the claim discipline the project already
commits to, and the source material's own pre-publish checklist blocks external writing until it is
done. It cannot be validated until at least one of Stories 1 to 3 has shipped.

**Independent Test**: A person other than the implementer follows the reproduction commands in the
repository and obtains the published numbers within the stated tolerance on the stated hardware.

**Acceptance Scenarios**:

1. **Given** a shipped mechanism, **When** a reader consults the residue account, **Then** it states
   which workload the mechanism removed, which cases still fall outside it, and how each of those
   fails.
2. **Given** any performance number published about this work, **When** a reader runs the named
   command on the named hardware, **Then** they obtain a number within the stated tolerance.
3. **Given** a number that was measured on prototype code rather than the shipped library, **When** it
   appears in any document, **Then** it is labelled as a prototype measurement at the point of use.

---

### Edge Cases

**Divided ownership (Story 3)**
- Dividing into more windows than there are elements, into zero windows, or dividing an empty array.
- Reassembling windows presented in a different order than they were produced.
- Reassembling a set that contains a duplicate of one window and is missing another, so the count
  matches but the coverage does not.
- A worker failing or panicking while holding a window: the allocation must not leak and must not be
  freed twice.
- Element types that themselves own memory, so each window's drop must run destructors for its own
  range only.

**Read-only buffers (Story 2)**
- Offsets resolved against a *different* read-only buffer of the same length: this is in-bounds but
  produces the wrong bytes. It is a logic error, not a memory error, and must be documented as a
  known limit rather than claimed as prevented.
- Resolving a byte range that is not valid text when text is requested.
- Converting back to a mutable buffer while another owner is alive.
- A zero-length buffer, and a zero-length offset range.
- The last owner being dropped on a different thread than the one that created the buffer.

**Read-only arenas (Story 1)**
- Ending the build phase on an empty arena.
- A handle that was already stale (its slot freed) before the build phase ended.
- A handle whose slot index is beyond the arena's storage.
- Handles for one element type used against an arena of another element type.

## Requirements *(mandatory)*

### Functional Requirements

**Divided ownership (Story 3)**

- **FR-001**: A Milo programmer MUST be able to consume an owned array and receive a collection of
  disjoint, owned, fixed-size windows over its storage, with no element copied.
- **FR-002**: Each window MUST support bounds-checked reading, writing, element swapping, and
  iteration over its own range, and MUST NOT offer any operation that grows, shrinks, or reallocates
  the underlying storage.
- **FR-003**: A window MUST be transferable to another thread when its element type is, and the
  system MUST reject at compile time any program that transfers a window whose element type is not.
- **FR-004**: Reassembly MUST verify that the windows presented came from the same division, that
  none is missing, and that they cover the original storage exactly; failure MUST produce a named,
  deterministic error and MUST NOT corrupt, double-free, or leak memory.
- **FR-005**: Successful reassembly MUST return the original array with its original storage,
  length, and capacity, without copying elements.
- **FR-006**: When windows are dropped instead of reassembled, the underlying storage MUST be
  released exactly once, after each window has run destructors for its own range exactly once.

**Read-only buffers (Story 2)**

- **FR-007**: A programmer MUST be able to consume an owned buffer and receive a read-only buffer
  over the same storage, with no element copied.
- **FR-008**: The read-only buffer type MUST expose no operation that mutates its contents, so
  mutation is rejected by name resolution rather than by a dedicated check.
- **FR-009**: The system MUST provide a storable, copyable offset-and-length value that contains no
  pointer and no hidden state, and that can be held in structs, vectors, and maps, and serialized.
- **FR-010**: Resolving an offset value against a read-only buffer MUST be bounds-checked and MUST
  yield either a transient borrowed view or an explicitly requested owned copy, at the programmer's
  choice.
- **FR-011**: A read-only buffer MUST be shareable by clone among concurrently running tasks and OS
  threads when its element type permits, with all holders observing identical contents.
- **FR-012**: A programmer MUST be able to recover the original mutable buffer when no other holder
  is alive; when other holders are alive the attempt MUST return a named error, and any copying
  fallback MUST be a separately named operation the caller opts into.
- **FR-013**: The last holder being dropped MUST release the storage exactly once after running
  element destructors.

**Read-only arenas (Story 1)**

- **FR-014**: A programmer MUST be able to consume an arena and receive a read-only arena on which no
  operation removes, clears, reuses, or allocates storage.
- **FR-015**: Lookup on a read-only arena MUST return the value directly, with no optional wrapper
  and no generation or liveness check, for any handle minted from that arena before conversion.
- **FR-016**: A handle minted from a different arena MUST be rejected: at compile time where the
  element types differ, and at runtime with a named deterministic error where they do not.
- **FR-017**: A slot index outside the arena's storage MUST fail with a named bounds error.
- **FR-018**: Dropping a read-only arena MUST run every element destructor exactly once and release
  its storage exactly once.

**Cross-cutting**

- **FR-019**: Every one of the three conversions MUST consume its input, so that any later use of the
  original binding is rejected by the existing move checker with a diagnostic naming the moved
  variable and its source location. No new compile-time rule may be introduced to obtain this
  rejection.
- **FR-020**: Every failure mode introduced by this work MUST be deterministic and named. No failure
  mode may be undefined behaviour, a silently wrong value presented as correct, or a crash without a
  source location.
- **FR-021**: All uses of unsafe operations introduced by this work MUST be confined to the new
  library files, and each MUST carry a written statement of the invariant that makes it sound.
- **FR-022**: Every mechanism MUST have negative tests covering each rejection in its acceptance
  scenarios: the compile-time rejections as programs that must fail to compile with a pinned
  message, and the runtime rejections as programs that must produce the named error.
- **FR-023**: Every mechanism MUST pass memory-error and thread-error sanitizer runs across its
  success path, its error paths, its all-dropped path, and an element type with destructors.
- **FR-024**: The project's account of where Rust genuinely wins MUST be updated to state, for each
  residue, which workload this work removed and which cases remain; each remaining case MUST name
  how it fails.
- **FR-025**: Every published measurement MUST be reproducible by a command stored in the
  repository, and any number measured on prototype rather than shipped code MUST be labelled as such
  where it appears.
- **FR-026**: Programs that were valid before this work MUST remain valid and produce identical
  results; the existing arena, vector, and concurrency surfaces MUST keep their current behaviour
  for callers that do not opt in.

**Scope decisions requiring confirmation**

- **FR-027**: Convenience wrappers that hide the divide-and-reassemble cycle behind a single
  parallel-transform call, dynamic load balancing over a work queue of windows, a reusable worker
  pool behind blocking promises, an append-only middle tier for arenas, and an offsets mode for
  generated deserializers are [NEEDS CLARIFICATION: in scope for this feature, or deferred to a
  follow-on feature? The source material lists them as "Phase 2" of each plan].
- **FR-028**: The per-core scheduler runtime, the strictly static fork-join borrow primitive, and the
  public blog post are [NEEDS CLARIFICATION: in scope, or explicitly excluded? The source material
  labels the first two as later phases and a research track, and the third as an outline whose own
  pre-publish checklist blocks it until numbers are re-measured on multi-core hardware by an
  independent party].

### Key Entities

- **Window**: an owned, fixed-size view over part of one array's storage. Knows its own length and
  which division produced it. Disjoint from its siblings by construction. Cannot grow or shrink.
- **Division identity**: the shared record that ties a set of windows to the one array they came
  from, tracks how many are still alive, and holds what is needed to hand the original array back.
- **Read-only buffer**: a shared owner of immutable storage. Offers reading, cloning, and recovery of
  the original mutable buffer when uniquely held. Offers nothing that mutates.
- **Offset value**: a start and a length. Plain data: copyable, storable, serializable, with no
  pointer and no tie to any particular buffer. Meaningful only when resolved against one.
- **Read-only arena**: an arena that can no longer allocate, free, or clear. Every handle minted
  before conversion resolves for as long as it exists.
- **Handle**: unchanged from today. A copyable token, distinct per element type, that names a slot.

## Success Criteria *(mandatory)*

Baselines are re-measured on the development host before the work begins; the numbers below are the
ratios the source material recorded on a single-core container, which the shipped versions must
match or beat on equal hardware.

### Measurable Outcomes

- **SC-001**: A parallel elementwise transform over a large array uses no more peak memory than the
  sequential version of the same program, within 5%, where today it uses roughly twice as much.
- **SC-002**: That same parallel transform completes within 1.3x of the equivalent C program using
  threads over one shared buffer, on the same hardware, where today it is roughly 5x slower.
- **SC-003**: A parsing workload that keeps views into its input performs fewer than 100 allocations
  where the copying version performs one per retained piece (three million in the delivered
  benchmark), and its peak memory drops by at least the size of the retained payload.
- **SC-004**: Lookup in a read-only arena is at least 1.5x faster than the generation-checked lookup
  it replaces, and its call sites contain no failure handling.
- **SC-005**: Every program in the negative test set fails in the intended way: the compile-time
  cases produce the pinned diagnostic naming the moved variable, and the runtime cases produce the
  named error. Each of these tests fails if its mechanism is removed.
- **SC-006**: Sanitizer runs over every mechanism's success, error, all-dropped, and
  destructor-bearing paths report zero findings.
- **SC-007**: The whole existing test suite and every example continue to pass unchanged.
- **SC-008**: A person other than the implementer reproduces every published number from a command
  in the repository, within the stated tolerance.
- **SC-009**: The unsafe surface added by this work is small enough to audit in one sitting: it stays
  within a single file per mechanism, and every unsafe operation carries its soundness statement.

## Assumptions

- **The three mechanisms are one feature, not three.** They share a single thesis and the source
  material presents them as one idea applied three times, so they are specified together and
  delivered in priority order.
- **The arena is the target of the freeze mechanism, not the block pool.** The source material calls
  it "Pool", but the described surface (typed handles, generation checks, optional lookup) is this
  repository's `Arena`; `std/pool` is an unrelated fixed-block allocator. Naming will follow the
  arena module, and a name that collides with the existing pool module will not be used.
- **No new compile-time rule is expected.** Every rejection in this spec is either an existing move
  error or the absence of a method. If implementation shows a rejection cannot be obtained that way,
  that is a finding to report before adding a rule, not a licence to add one.
- **Prototype numbers are not shipped numbers.** The delivered measurements come from programs that
  hand-roll the mechanisms with raw pointers on a single-core container. They establish that the win
  exists; they do not establish that the shipped version keeps it. Every criterion above is measured
  again on the shipped library.
- **Baselines are re-measured on the development host.** The absolute times in the source material
  came from one core; ratios, not absolute times, carry over.
- **The unsafe seam is expected to be expressible today.** Marker-trait overrides for cross-thread
  transfer already exist in the compiler; if the generic form needed here does not, that is a
  finding for the planning phase.
- **Wrong-buffer offset resolution stays a known limit.** Tying an offset value to one specific
  buffer at compile time is not achievable under the project's axiom, so resolving offsets against
  the wrong buffer of sufficient length yields wrong data rather than an error. This is documented
  as a limit, not claimed as prevented. An optional debug-mode tag may narrow it.
- **Arenas that free and reuse slots keep their runtime checks.** The read-only conversion serves the
  build-then-read shape only.
- **Long-lived contended shared mutable state remains out of scope.** These mechanisms divide data
  and share immutable data; they are not a concurrent map, and the documentation must say so before
  users discover it.
- **The delivered archive is the whole input.** Its four documents, eight prototype programs, and
  benchmark scorecard are treated as the requirement source; nothing outside it is assumed.

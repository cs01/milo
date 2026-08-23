# Specification Quality Checklist: Typed HIR Through the Expression Layer

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-23
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *in requirements and success criteria. See note 1 for the deliberate exception.*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — *see note 2*
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded — *explicit Out of Scope section*
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification — *see note 1*

## Notes

**Note 1 — deliberate exception.** The "Context: What Working Means Here" section
names specific files and counter identifiers. This is not a leak. Every number in
that section was measured on `cc045ef2` rather than recalled, and the success
criteria are stated as deltas against those numbers (115 → 0, 637 → higher, 12 → 0).
A baseline that cannot be re-measured cannot be verified, so the section names what
was measured and how. The requirements themselves stay behavioral.

**Note 2 — stakeholder framing.** The stakeholder for this feature is a compiler
developer. Requirements are written so someone who has not read the backend can
judge whether each one holds: "aborts naming the node kind rather than defaulting"
is checkable without knowing the code.

**Note 3 — the P1 tie.** Three stories share P1. This is intentional and not
priority inflation. Story 3 (isolation) is a precondition: without it, the evidence
Stories 1 and 2 produce is not trustworthy, because a concurrent session's edit can
invalidate a run mid-flight. Story 4 is genuinely P2 — it guards the work rather
than performing it.

**Note 4 — the moving denominator.** A concurrent session added `sealShared` and
`shardMapWith` to the corpus after the baseline was measured. The corpus is 658 and
the manifest 637 as of this writing. The gap is expected to move under this feature
from both ends.

**Note 5 — one assumption carries most of the risk.** "The existing HIR node set is
adequate for the expression language" is unverified. If a significant expression
kind has no representation, scope grows. This is the assumption most worth testing
early, by attempting the most structurally awkward expression kind first rather than
the easiest.

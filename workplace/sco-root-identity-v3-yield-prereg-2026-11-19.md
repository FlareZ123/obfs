# Preregistration: v3 root-identity selector yield on existing SCO examples

**Agent 6, 19 November 2026. Status: frozen before scan implementation.**

## Question

The ambient-safe v3 source-only root-identity proof passed its frozen safety
corpus on Ubuntu and Windows. The next question is practical yield: does this
narrow selector recognize any direct exported async operations already present
in the repository's existing SCO examples, and why does it refuse the rest?

This is a deterministic source-classification study. It does not alter any
example or production partitioner.

## Frozen corpus

Scan these repository files exactly as they exist at the source commit used by
the run:

1. `examples/application-challenge/sco-before/api.mjs`
2. `examples/application-challenge/sco-public/sco-before/api.mjs`
3. `examples/sco-graph/before/api.mjs`
4. `examples/sco-graph/before/audit.mjs`
5. `examples/sco-graph/before/secret.mjs`
6. `examples/sco-private-const/before/mixed.mjs`
7. `examples/sco-private-env/before/mixed.mjs`
8. `examples/sco-private-graph/before/mixed.mjs`
9. `examples/sco-private-graph/before/private/engine.mjs`
10. `examples/sco-private/before-private.mjs`
11. `examples/sco-public-helpers/before/mixed.mjs`
12. `examples/sco-selective/before/mixed.mjs`
13. `examples/sco-static-imports/before/mixed.mjs`

The scan considers every **direct exported async function declaration** and
every direct exported `const` initialized to an async function/arrow
expression. Files with no such export remain in the denominator as files but
do not create function cases.

The generated/public SCO stub in item 2 remains intentionally included because
it is a repository example with a direct async export. Its likely refusal due
to `arguments` and network calls is useful evidence about the proof boundary.

## Frozen outputs

For each discovered direct async export record:

- file path;
- export name;
- v3 `eligible` boolean;
- sorted refusal reasons.

Also report:

- number of scanned files;
- number of discovered direct exported async functions;
- eligible count and fraction;
- refused count and fraction;
- refusal-reason frequency;
- eligible function names and paths.

The scan must be deterministic across Ubuntu and Windows for the same source
commit.

## Interpretation rule

No minimum yield is required for a useful result. A low yield is evidence that
the source-only selector is too narrow for the existing SCO examples and should
remain a specialized optimization. A nonzero yield identifies existing shapes
worth validating through the cbor root-token lane.

This scan does not prove whole-program eligibility. The v3 analyzer remains a
function-local source proof, so any accepted function still requires the
existing graph/realm/loader/authorization analyses before production
selection.

A result from this yield scan cannot change **RELEASE-BLOCKED**.

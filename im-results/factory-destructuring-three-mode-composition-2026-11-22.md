# Single-use factory plus imported destructuring: three-mode composition gate

**Date:** 22 November 2026. **Author:** Agent 16. **Status:** intermediate correctness
and refusal evidence. This is not a confidentiality, tamper-resistance, or
environment-locking result.

## Reproducer

The standalone [generated grid](../test/factory-destructuring-crossfile-grid.test.js)
constructs two-file ES modules. The exporter creates a private inert object
literal in a single-use factory and exports its owner. The importer uses a
discarded assignment destructuring pattern with a statically quoted computed
key, an unused-default counter, and a separate ordinary own-field read.

Twelve deterministic source variations cover changing field spellings, values,
and zero-valued reads. For each variation the compiler runs in each of
`coo`, `sno`, and `sco` modes with `closedWorld:true` and identifier/string
transformations disabled, preserving a focused owner-key contract.

- **36 positive compilations:** exactly one cross-file owned object and two
  protected own keys per compilation, for 72 renamed own-key observations
  in the metric ledger. Every generated graph executed in a separate native
  Node ESM process and matched the untransformed graph output.
- **108 negative compilations:** 12 source variations × three modes ×
  three distinct hazards (escaping the destructuring assignment's owner
  result, reflective `Object.keys(owner)`, and repeated factory invocation).
  In every case the compiler reported zero cross-file owner or property
  rewrites, and the emitted graph's output matched native execution.
- **Static public-name recovery control:** one successful emitted COO graph
  was passed through `normalizeDistributedFiles`; it recovered both rewritten
  labels, and the normalized graph still matched the original. This is
  a negative secrecy observation for the selected source family.

The cases deliberately combine two existing proofs rather than expanding
admission. Rewriting imported destructuring without preserving the factory's
private single-use ownership, or failing to track the assignment's returned
object identity, would make this gate fail.

## Source-pinned verification

[Focused Ubuntu and Windows Node 22 + strict JSDoc run 45032479400](https://github.com/FlareZ123/obfs/actions/runs/45032479400)
completed **successfully** against exact source
`517b54266552e9c3b392bdb5ae3f7a8804ee57b2`.
The earlier COO-only 12-positive/36-negative precursor
[run 45032331414](https://github.com/FlareZ123/obfs/actions/runs/45032331414)
also passed at `5de2c8569be9dc4b98faca278e1ade5cb6426551`.
Each test reexecuted original and transformed ESM graphs through Node's
actual module loader, not an AST interpreter or in-VM mocked loader.

## Limits and next actions

This finite corpus does not prove arbitrary application equivalence,
general cross-file interprocedural closure, browser equivalence,
hosted publication safety, or a universal 2.5× runtime ceiling.
It adds no demonstrated attacker-cost advantage over ordinary minification.
A stronger follow-up would use a genuine browser ESM fixture, strict paired
CPU measurements for repeated protected reads, and source-observer negative
controls. Maintain the upstream RELEASE-BLOCKED security decision.

The test keeps all source generation deterministic. The source pin, mode,
seed, compiler options, original graph and observed output are sufficient to
reproduce the focused gate with `node --test test/factory-destructuring-crossfile-grid.test.js`.

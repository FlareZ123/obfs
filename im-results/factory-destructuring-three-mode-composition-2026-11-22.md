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

## Real Chromium cross-module validation

A separate [headless Chromium HTTP/ESM reproducer](../test/factory-destructuring-browser.js)
serves eight deterministic owner-factory graphs in two versions, each with a
positive imported computed-key destructuring path and an independent
`Object.keys(owner)` reflection refusal. It requests separately published
original and transformed module URLs under the same browser host, performs
native ESM imports, and compares exported result arrays in Chromium rather
than trusting a Node-only VM. **Eight positive browser graphs rewrote two
field keys each (16 protected keys); eight reflected graphs refused owner
renaming.** Every native-versus-emitted result agreed.

A first [red source-pinned browser run 45032860095](https://github.com/FlareZ123/obfs/actions/runs/45032860095)
at `27b4e94f7cf979c3153d52fe48461e309dc97b0e` passed the new
Chromium probe but failed the later strict JSDoc step because a
`string | Buffer` file-content type had not been narrowed in one code path.
The annotation was corrected, and the **full existing real-browser workflow**
[45033055044](https://github.com/FlareZ123/obfs/actions/runs/45033055044)
completed **successfully** at exact SHA
`a8d40562678d4615d237cb1e5bb625281151274f`, including project
and external JSDoc typechecks. No dedicated new CI workflow was introduced.
The browser test is included in `.github/workflows/manual-browser.yml`.

This is browser parity evidence for a finite selected source family.
It does not exercise full hostile-browser ownership, self-referential inline
source readers, browser version-specific locks, or sustained CPU cost.

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

# Equal-width private-property rewriting under location-only observation

**Date:** 2026-11-17. **Status:** reproducible native Node 22.16.0
feasibility probe; compiler integration is **not implemented** and security
benefits are **unmeasured**. This belongs to intermediate research.

## Motivation

Existing exact-source observer admission in `src/ast.js` conservatively
disables every transformation in a file or graph that could expose the
source through `console.trace`, Error printing, Node util callsite APIs,
or warnings. This is a correctness-compatible fallback but leaves no
protected work in those cases.

A narrower class of observations exposes **source coordinates only**.
For a proven private object field, replacing every reference with an
equally long valid identifier preserves the offsets of all unchanged
subsequent tokens. This suggests a possible alternative to full refusal
under a restricted observer model.

## Reproducible native probe

`sims/source-coordinate-fixed-width-probe.js` derives a SHA-256-dependent
valid identifier of exactly the same length as
`veryLongPrivateField`, substitutes it consistently in an owned object
literal and its read, and compares with a deliberately unsafe one-character
substitution. It exercises three fixed-name Node VM programs:
`console.trace()`, `console.error(new Error('probe'))`, and
`node:util.getCallSites(1)[0].columnNumber`.

An initial independent Node 22.16.0 run of the console trace fixture showed:

| Source | Exposed VM frame | Returned value |
| --- | --- | --- |
| Original `veryLongPrivateField` | `fixed-width-source.cjs:1:97` | 73 |
| Equal-width replacement | `fixed-width-source.cjs:1:97` | 73 |
| Shortened replacement | `fixed-width-source.cjs:1:59` | 73 |

This is a **native/manual** substitution, not a compiler output result.
The repository probe also asserts native equality across three observer
types and a mismatch for shortening. The pinned native feasibility, full focused regression and strict
JSDoc [CI run 44102821721](https://github.com/FlareZ123/obfs/actions/runs/44102821721)
**passed** from `agent50/fixed-width-source-coordinate-20261117` at exact
`16a21975d5ab6ac1614317770e7ca98b98b896c6`.

## Falsifying equal width as a universal source-preservation method

A separate native Node 22.16.0 test kept the source string byte length
identical while renaming a field inside
`function compute(){return owner.veryLongPrivateField;}` to
`function compute(){return owner.p_aaaaaaaaaaaaaaaaaa;}`.
A direct `compute.toString()` observer returned **different** source
strings despite the unchanged byte length. Therefore the candidate is
restricted to validated coordinate-only observers. Full native-source
observers still require either exact bytes or another independently proven
representation strategy.

The same native feasibility script subsequently **passed on both Ubuntu and Windows Node 22** in [run 44103793268](https://github.com/FlareZ123/obfs/actions/runs/44103793268), pinned to `adbfd942dc4d87ec03e4a5734750ba0492bf78f4`. Both strict typecheck steps and the complete focused semantic regression suite passed on each runner. The result remains a native manual-substitution observation, with no integrated equal-width compiler pass.

## Scope and implementation requirements

Equal width is **insufficient** when an observer reads function body bytes,
identifier names, source hashes, stack function names or lexical spellings
through `Function#toString`, serialized source, custom loggers or
reflective object-property iteration. It does not protect against
instrumented runtime extraction in COO/SNO. A safe compiler implementation
would need at least:

- A classifier distinguishing coordinate-only observers from exact-byte,
  function-name and object-key observers, plus cross-module transitive
  tracking.
- Length-preserving, identifier-valid, collision-free property substitution
  covering all syntactic and computed accesses. Existing proof for private
  object ownership must still hold.
- Differential tests of Node and Chromium stacks, source maps, CRLF and
  Unicode source-position accounting, and custom `Error.prepareStackTrace`.
- Protected-work yield and original-versus-emitted runtime performance
  measurement under the 2.5× budget, followed by attacker reconstruction
  evaluation. Simple same-length renaming alone is unlikely to offer
  substantial resistance to a static attacker.

This should be investigated as a narrowly proven positive transform rather
than promoted into a generic "stack-observer-safe" rewrite.

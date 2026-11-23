# Four-file ESM owner-key yield and source-observation boundary (23 November 2026)

**Classification:** intermediate reproducible compatibility evidence, not a release/security result.  
**Agent:** 6.  
**Base:** main `d087ae6a40da170716bc60fc5423a1833da0176b` at branch creation.  
**Branch:** `agent6/interfile-source-boundary-20261123`.  
**Final tested source:** `8ea8ac087bc1ee06e6fd6846d99af79336d296f9`.  
**Green focused validation:** [run 45257793660](https://github.com/FlareZ123/obfs/actions/runs/45257793660), Ubuntu and Windows Node 22.23.4; both focused jobs and strict project/external/budget JSDoc succeeded, full `node22` skipped by design.

## Motivation

The long-standing `test/interfile.test.js` requested exactly one cross-file owner and two property rewrites in a four-file graph. On current main it instead observed `crossFile.objects=0`, `properties=0` on both operating systems. The original fixture exported `internal(){return state.secretValue;}`, whose `Function.prototype.toString` spelling is externally inspectable. Changing that export to an owner-field-derived value alone was insufficient to recover positive yield: the original index then combined two numeric-unary imports and the separately imported field-derived result in an arithmetic chain.

These are source-observation/proof-admission limitations of the tested candidate. They do not imply the original code computes incorrectly, or that allowing additional renames would be sound.

## Controlled matrix

A test-only, source-pinned 14-case diagnostic in `test/interfile.test.js` ran at `1eb3c7d6fb7bab00aea29835bf5f10491e891565`; both Ubuntu and Windows [run 45257389036](https://github.com/FlareZ123/obfs/actions/runs/45257389036) emitted identical observations:

| Graph variation | Cross-file objects | Renamed properties |
| --- | ---: | ---: |
| State owner alone | 1 | 2 |
| State + direct index member read | 1 | 2 |
| State + index with static `globalThis.window.api.bridge` | 1 | 2 |
| State + workerA private function/alias | 1 | 2 |
| State + workerB destructuring | 1 | 2 |
| State + both workers | 1 | 2 |
| All four, index adds `a+b+state.secretValue` | 0 | 0 |
| All four, index adds `(+a)+(+b)+state.secretValue` | 1 | 2 |
| All four, index imports worker values without use | 1 | 2 |
| All four, index exposes worker values without coercing them | 1 | 2 |
| Same pass-through plus static global host property read | 1 | 2 |
| Direct exported owner-field value, direct index read | 1 | 2 |
| Direct exported owner-field value, four-file arithmetic | 0 | 0 |
| Public callable reader in producer, simple index read | 0 | 0 |

The matrix job itself was red because the then-current original positive assertion remained failing; its logged observations are diagnostic evidence. The earlier 10-way [run 45257054465](https://github.com/FlareZ123/obfs/actions/runs/45257054465) agreed on overlapping cases, although its all-module arithmetic variant used `a+b` and did not independently test unary numeric coercion.

The contrast between `a+b` and `(+a)+(+b)` is consistent with conservative source-coercion analysis. The separate export of `internalValue=state.secretValue` remains an additional narrow positive-yield proof gap. The matrix establishes transform counts, not a complete mechanistic trace of every early-return guard.

## Final candidate tests

The revised positive fixture retains four ESM files, two independent worker consumption styles, named imports, a static external host API reference, actual Node execution and the original computed result of 39. The producer exports only the literal state object; the index reads the proven owner field twice instead of exporting a source-visible reader or relying on an unproved imported field-value primitive. Its assertions remain **one rewritten object and two renamed properties**, with emitted/native result parity.

A separate negative fixture intentionally exports `internal(){return state.secretValue;}`. It verifies refusal (`0/0`) while executing the output and inspecting `m.internal.toString().includes('secretValue')`, which remains true; the runtime numeric result is 6. Thus preserving the positive transformation requirement does not suppress a function-source observability regression.

The final [two-platform green focused CI](https://github.com/FlareZ123/obfs/actions/runs/45257793660) validates both cases and strict JSDoc at `8ea8ac087bc1ee06e6fd6846d99af79336d296f9`. It is no substitute for full browser/integration acceptance. The mainline release decision is unchanged: **RELEASE-BLOCKED**.

## Unresolved

A general, sound proof of imported primitive status for direct reads from an earlier initialized own literal field may permit the `internalValue` graph to become a positive case, but must account for mutation, getter/prototype effects, ESM initialization ordering and arbitrary imported consumers. No production proof expansion was attempted here. Source-visible exported callable readers must continue to preserve spelling unless a complete source-observation contract justifies a narrower exception.

# Bounded caller-source effect gate: red-to-green pilot and unresolved cross-pass source contract

**Status:** Intermediate compiler experiment only, not an established security proof or mainline integration.  
**Investigator:** Agent 16. **Date:** 2026-11-23 UTC.  
**Base source:** proposed PR #299 head `b826c10e3c59c2210c00448a0645bb8751a87758`.  
**Verified pilot source:** [`agent16/cjs-caller-effect-pilot-20261123` at `918112ca6ca2ad494b95a26c51a6f833283b9180`](https://github.com/FlareZ123/obfs/tree/918112ca6ca2ad494b95a26c51a6f833283b9180). Keep it independent of main and Agent3's canonical integration PR.

## Threat and compatibility problem

The source-pinned [counterexample report](cjs-caller-source-observer-boundary-2026-11-23.md) and [negative CI 45107155036](https://github.com/FlareZ123/obfs/actions/runs/45107155036) show that a non-strict CommonJS function can be source-observed *without passing its identity by name or value*: an uncompiled direct callee uses `Function#caller`, an external accessor getter executes on property read, or an external `Symbol.toPrimitive` executes during arithmetic. All of these occur while the caller is active. Renaming its private own-field spellings changes the string reported by the external dependency, even though numeric outputs remain 22/25.

An independently current-main-based eight-case replay at source `a81cc9ee3616e3e0b738febe614610fe578ef003` reproduced **5 pass / 3 intended parity failures on Ubuntu and Windows** in [CI 45107556964](https://github.com/FlareZ123/obfs/actions/runs/45107556964). This defect predates the PR and cannot be attributed only to its source-parity changes.

## Pilot: per-owner nonreentrancy certificate

New isolated `src/caller-source-purity.js` and narrow integration into `src/properties.js` and `src/symbol-properties.js` decline rewriting a proven owner's keys whenever an affected **non-strict** function may synchronously invoke unproved code. It is a *compile-time refusal*, not a runtime wrapper; no new hot-path instructions are emitted.

The bounded straight-line grammar admits direct literal arithmetic, primitive own-data reads proved by existing ownership analysis, immutable local plain records, simple no-hook `typeof`/boolean/strict-identity operations on opaque arguments, direct-call constant primitive argument provenance, and inert result arrays. It declines explicit calls, unknown receivers/getters, nonprimitive coercions, dynamic scope, unsupported control flow, side-effectful property access, async execution, and other unproved effects. Strict ESM and functions covered by a valid lexical `'use strict'` directive are exempt **only for this specific sloppy `Function#caller` mechanism**; other source observers remain possible.

The root-independent AST parent/call inventory is memoized per immutable parsed AST to avoid rescanning the entire source for each owner. Candidate ownership proofs are calculated once and independently; their *primitive-valued* own-member reads are unioned so a function reading two unrelated safely proven records is not rejected just because it accesses another record.

Bounded argument: under the standard Node 22 language/runtime semantics and the existing owner-escape proof, the admitted expression grammar executes no user-supplied JavaScript synchronously while an affected caller's activation remains on the stack. Thus an uncompiled, reentrant callee cannot use `Function#caller` to retrieve that active function's original text. The argument **does not** establish that source is secret under debugging, that callers are inaccessible through other APIs, that the whole compiler preserves every JS behavior, or that arbitrary source-safe code can be rewritten.

## Source-pinned tests and countercontrols

| Test suite | Earlier red/partial | Latest isolated two-OS result |
|---|---|---|
| Three external observation routes; bundled controls; strict and private positives; opt-in Symbol variants | Draft PR #299 default backend: 5 pass / 3 fail per OS on eight-case [45107155036](https://github.com/FlareZ123/obfs/actions/runs/45107155036) | [45109024777](https://github.com/FlareZ123/obfs/actions/runs/45109024777): 13/13 pass per OS, strict JSDoc pass |
| Five deliberately safe private-yield configurations | First pilot [45108616095](https://github.com/FlareZ123/obfs/actions/runs/45108616095): 2 pass / 3 positive yield losses per OS | [45109020392](https://github.com/FlareZ123/obfs/actions/runs/45109020392): 5/5 pass per OS, strict JSDoc pass |
| Ambient preload host callback: string, identifier and combined default | [45108673618](https://github.com/FlareZ123/obfs/actions/runs/45108673618): property-only gate passes, three other passes fail source parity per OS | **Unresolved**: this pilot does not guard identifier/string transformations |

Files: [`test/cjs-caller-source-boundary.test.js`](https://github.com/FlareZ123/obfs/blob/918112ca6ca2ad494b95a26c51a6f833283b9180/test/cjs-caller-source-boundary.test.js), [`test/caller-effect-private-positive.test.js`](https://github.com/FlareZ123/obfs/blob/918112ca6ca2ad494b95a26c51a6f833283b9180/test/caller-effect-private-positive.test.js), and [`test/ambient-caller-pipeline.test.js`](https://github.com/FlareZ123/obfs/blob/399abb09bedec90ec35dd55d0fad9f10bb82973b/test/ambient-caller-pipeline.test.js). All focused CI uses actual native Node child processes for source-observer negatives, with deterministic source seeds and no source rewrite in the external helper. The positive-yield suite additionally evaluates original versus compiled CommonJS output via Node's `vm` context and asserts exactly the expected key count.

## Not a ready-to-merge fix

1. The **identifier and string** passes (and any chosen VM/branch/wasm lowerings) need a common source-exposure contract, not a property-only check. The separate ambient-host run demonstrates the default pipeline remains source-incompatible.
2. Full-suite differential against the original PR candidate is still being assessed; earlier full pilot [45108123157](https://github.com/FlareZ123/obfs/actions/runs/45108123157) did not pass, including independent positive-yield suites. Its failures must be compared with the same PR parent before attributing regressions. Passing a small matrix does not establish acceptable production coverage.
3. This compile-only gate cannot establish the runtime 2.5× cap for all workloads. The opt-in Symbol backend has **independent** repeated hot Node CPU evidence of a >2.5× violation; see [separate budget report](private-key-symbol-hot-cpu-budget-2026-11-22.md). No runtime benchmark is claimed here.
4. The helper certifies only a small class of source-observation effects, not all ways source text can escape and not protection against the SNO threat model's full filesystem/runtime/memory control. If its effect grammar grows, prove all new operations are callback-free before widening positive admission.
5. Continue treating the repository release objective as **RELEASE-BLOCKED** until correctness, independent security tests, and measured performance/compatibility jointly meet the requested conditions.

Suggested integration direction: let the original source AST and declared set of opaque host boundaries produce a per-function *source-exposure/side-effect certificate* shared by all transformations. All passes must decline or preserve text in functions without that certificate. Keep a real corpus of positive private owners; overly broad blanket guards materially undermine the obfuscator's value. Review with Agent3 rather than opening an overlapping canonical integration PR.

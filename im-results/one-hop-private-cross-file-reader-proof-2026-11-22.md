# One-hop source-safe exported reader delegation: two-platform proof and paired six-module profiles

**Date:** 22 November 2026. **Author:** Agent 4. **Status:** experimentally supported *intermediate* JS-transform result. **Review branch:** `agent4/review-classic-source-witness-20261122`.

## Problem and baseline

The canonical source-observer integration PR #299 preserves the body spelling of externally reachable exported functions when `preservePublicCallableSource:true`. An originally transformable ESM reader of the form:

```js
export const state = {secretOffset:19};
export function readOffset(owner) { return owner.secretOffset; }
```

contains a property name in the exported reader's `Function.prototype.toString` body. Renaming it changes an externally observable function source. Correct source-preserving transformation of this direct form declines. However, an *independent source program* can delegate through a private local helper:

```js
export const state = {secretOffset:19};
function privateOffset(owner) { return owner.secretOffset; }
export function readOffset(owner) { return privateOffset(owner); }
```

The public `readOffset` source may now remain identical, while the hidden `privateOffset` member reference and the owner's literal field can be rewritten together. The old cross-module reader proof only recognized a directly exported single-member return, so it declined this potentially safe private-wrapper graph.

A two-file *source-pinned* diagnostic [45080451905](https://github.com/FlareZ123/obfs/actions/runs/45080451905) on Ubuntu and Windows gave `{directLegacy:2,directSourceSafe:0,privateWrappedLegacy:0,privateWrappedSourceSafe:0}` on a two-key owner. Crucially, the six source-observer detectors (local `Function#toString`, imported function/primitive coercion, and distributed source-byte observers) were all false in [45080300745](https://github.com/FlareZ123/obfs/actions/runs/45080300745): the refusal was a *cross-file reader proof limitation*, rather than an identified actual observer in the modified app.

## Scoped transformation proof

Extended `src/cross-properties.js` exported reader recognition to allow one forwarding hop, with all of these preconditions:

1. The exported reader has a unique immutable binding, no extra local references, one plain identifier parameter, and its entire body is a direct return of a nonoptional helper call with that exact parameter, `return helper(owner)`.
2. The helper is an unexported top-level function declaration or immutable `const` function/arrow expression with a unique binding and **no references** beyond the sole exported wrapper call.
3. The helper has exactly one identifier parameter, is synchronous/non-generator, and has one expression consisting of a plain member read on that parameter (`return owner.field` or a statically known string-computed field). No extra expression statements, calls, argument spreads, or other forwarding arguments qualify.
4. Every import and reader use remains subject to the existing cross-module unique-owner, import-alias, known-own-key, reflection and source-exposure validations. The proof emits a coherent rename of the owner's own-key spelling and the hidden helper's single member spelling.

The first sketch allowed multiple helper arguments and was rejected as too broad, since ignored arguments could evaluate owner-shape reflection such as `Object.keys(owner)`. The final experiment restricts the delegation to a **unary direct call**. Original direct readers continue to work under their previous rules; refusal under public-source preservation is retained.

Code: `d94526572b0777e72d2b0a25e46b794fbbe596c6` (first proof), then `fb81effcb3cfd9c6e44898a2cf8b28ea22adf5e6` (unary safety restriction and TS18047 nullable-binding fix). The actual algorithm and tests are retained on the reviewer branch, with no competing canonical PR.

## Two-platform validation

The independent two-file diagnostic [45080729536](https://github.com/FlareZ123/obfs/actions/runs/45080729536) passed both Ubuntu and Windows strict focused validation with:

```json
{"directLegacy":2,"directSourceSafe":0,"privateWrappedLegacy":2,"privateWrappedSourceSafe":2}
```

The ten-case fail-closed adversarial matrix [45080775036](https://github.com/FlareZ123/obfs/actions/runs/45080775036) passed on both OSes, confirming no property rewrite when the helper leaks to `globalThis`, is explicitly exported, has a second use, is reassigned, has an extra statement, is called with `.call`, receives a nonformal parameter, receives an extra shape-observing argument, leaks through an exported arrow closure, or is nested with unproven scope.

The paired full-process six-module experiment uses **two explicitly modified source applications**: an own-key-only reflected record and a null-prototype record. Each additionally captures `process.argv[2]` with a primitive guard and changes the exported ESM private readers to delegate into fresh local helpers; comparisons always use the *corresponding modified native source* as baseline. No claim is made about the original frozen six-module app's property-renaming yield.

In [45080732944](https://github.com/FlareZ123/obfs/actions/runs/45080732944) at exact `fb81effcb3cfd9c6e44898a2cf8b28ea22adf5e6`, every variant on both Node 22.23.4 operating systems produced `privateFieldsRenamed=2`, `allOutputsEqual=true`, and `within2point5=true` across nine timed samples per profile:

| Platform | App variant | Workload | Native median ms | Emitted median ms | Ratio |
|---|---|---|---:|---:|---:|
| Ubuntu | Own-only | One event | 31.5015 | 30.7099 | 0.9749× |
| Ubuntu | Own-only | Sustained 80 | 45.4693 | 43.6911 | 0.9609× |
| Ubuntu | Null prototype | One event | 31.2686 | 31.4469 | 1.0057× |
| Ubuntu | Null prototype | Sustained 80 | 44.0106 | 44.2395 | 1.0052× |
| Windows | Own-only | One event | 56.0294 | 56.0216 | 0.9999× |
| Windows | Own-only | Sustained 80 | 74.4662 | 74.9022 | 1.0059× |
| Windows | Null prototype | One event | 59.1753 | 59.9915 | 1.0138× |
| Windows | Null prototype | Sustained 80 | 71.7835 | 69.7173 | 0.9712× |

The separate 11-workload hot-loop reviewer benchmark [45079859192](https://github.com/FlareZ123/obfs/actions/runs/45079859192) also passed two-OS strict checks: ten native/emitted property workloads retained real key transformations and exported wrapper source parity, with no sampled ratio above 2.5×. That benchmark factors heavy loops into private direct-call-only helpers. It is not a universal runtime bound.

## Limitations and pending integration

This experiment covers a one-hop unary private read under an explicit finite ESM closed-world graph. Arbitrary higher-order calls, extra parameters, dynamic receivers, helper leaks, cross-graph reflection, hostile loader instrumentation, exported owner shape observations outside the declared world, and general program reconstruction remain unproved. The computed 2.5× results apply only to these workloads and platforms. The broad SCO/COO/SNO security decision remains **RELEASE-BLOCKED**.

The final reviewer branch also includes source-type-aware classic-script global function/lexical source preservation tests and strict option-type JSDoc repairs. Agent 3 was informed through `communications/agent3/20261122T2302Z_agent4_crossfile-private-reader-green.md`. Full canonical integration must be reviewed against a complete source-pinned two-OS suite and real browser workloads before merging. Source parity and positive transformed work should both be enforced.

# Agent 4: source-plan rebind accepts effect- and API-changing edits outside tracked spans

**Date:** 2026-11-24T09:58Z  
**Reviewed candidate:** `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`  
**Reviewer:** Agent 4

I found a second acceptance-contract gap beyond the already-reported `Map` versus `MappedSourceRange[]` mismatch in `acceptPlannedPass`.

## Reproduction by source inspection

At candidate line 798 onward, `validatePlanSemantics` verifies:
- every tracked source slice is byte-for-byte equal to its original slice;
- an AST node of the same type still occupies each mapped range;
- a top-level `FunctionDeclaration` with the original name exists;
- a direct `Function.prototype.toString.call(observed)` call remains at the mapped reader range; and
- the reader remains in a top-level variable initializer with one declaration of the callable name.

It does not revalidate the original source-mirror/effect contract or the rest of the accepted program grammar. In particular, the predicate at lines 843–846 explicitly treats `Program` **or `ExportNamedDeclaration`** ancestors as acceptable for the callable.

Two synthetic edits therefore satisfy every current rebind predicate while changing semantics:

1. Insert `export ` immediately before the original private `function observed() { return 29; }`, using a `before-node` insertion. The mapped callable slice is still exactly the original function text, the reader call is unchanged, and Acorn reports the same FunctionDeclaration at the mapped range. The current top-level predicate accepts the new `ExportNamedDeclaration`, so the pass can be accepted even though the module now exports a function that was private in the producer input. I confirmed the AST shape with Acorn 8.x: the wrapped FunctionDeclaration starts after the `export ` prefix, so its node range matches the relocated source range.

2. Insert this statement at source offset 0, before the existing module:
   ```js
   Function.prototype.toString = function () { return 'tampered'; };
   ```
   The original callable and reader source slices remain exact and relocate by the prefix length. The reader call is still syntactically direct and all current declaration/top-level checks still pass. But the declared `pristineIntrinsicsPremise` is now false before the reader executes, so `observedSource` no longer contains the original function source. The current validator does not inspect this changed host-effect state.

For an isolated helper reproduction before the separate array/Map guard is repaired, pass `new Map(initial.trackedSourceRanges.map(r => [r.originSpanId, r]))` to `acceptPlannedPass`; `advancePlanRanges` iterates the map values and the remaining validator accepts the mapped ranges. Once the helper is corrected to the actual array contract, the same test should use the array directly.

## Suggested disposition

Please assess whether the first slice's acceptance contract is intentionally only a positional/source-slice check, with each pass separately trusted to preserve all non-span semantics. If so, document that boundary explicitly and ensure the tests establish that every enabled pass has the necessary independent semantic-preservation guarantee.

If `acceptPlannedPass` is intended to validate the source-observation effect after each pass, add red regressions for both cases. At minimum:
- retain the producer's non-exported callable invariant after rebind;
- rebind and validate the actual source-mirror reader/value path, not only the call syntax and callable name; and
- ensure a pass cannot invalidate the declared host-intrinsic premise before the reader executes (or require an explicit pass-specific preservation certificate for that premise).

I have not changed the candidate branch or dispatched CI. This is a synthetic acceptance-contract counterexample, not evidence that one of the currently enabled property/identifier/string passes emits either edit. The separate known `Map`/array mismatch remains a blocker to actual core pass acceptance.

— Agent 4

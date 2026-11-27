# Original source-span identity across sequential transform passes

**Date:** 2026-11-24  
**Status:** Open architecture/implementation contract question  
**Owner:** Agent 24  
**Related:** `workplace/source-observer-carrier-effect-contract-2026-11-23.md`, `communications/agent3/20261124T0537Z_agent24-original-span-rebase-contract.md`

## Problem

The proposed `SourceObservationPlan` is correctly qualified by `SourceUnitRef` and exact `sourceGeneration`. Its `SourceSpanId`, `DefinitionRef`, `CallSiteRef`, callable closures and effect records therefore refer to the original parsed source generation.

The current production pipeline, however, is sequential and reparses mutated source between passes:

1. `renameCrossFileProperties(prepared, seed)` rewrites the file group before the per-file loop (`src/core.js` around lines 2047–2048).
2. Local property renaming mutates `code` and reparses (`src/core.js` around 2236–2245).
3. Identifier renaming mutates `code` and reparses (`src/core.js` around 2248–2253).
4. String encoding receives the resulting post-property/post-identifier AST (`src/core.js` around 2257–2261).

Even if a protected callable itself is unchanged, an unrelated edit before it or an inserted helper at the top of the file can shift its current offsets. A later consumer cannot safely compare current AST `start/end` directly with an original-generation `SourceSpanId`. It may silently protect the wrong node or miss the intended closure.

The v2 contract mentions either retaining the plan against original spans or producing a validated edit map, but it does not yet define a stable node-identity or edit-map representation. This may belong in a separate pipeline-layer contract, but it must be mandatory.

## Required invariant

Every transform consumer must be able to prove that the current AST node it is about to mutate corresponds to the exact original `SourceSpanId` in the plan. It must never compare offsets across source generations without a validated mapping. If the mapping is absent, overlapping, stale or ambiguous, the consumer declines the affected edit.

**Coordinate unit is already explicit in the canonical schema.** The current `SourceSpanRef` typedef defines `startOffset` / `endOffset` as UTF-16 code-unit offsets and includes `coordinateUnit: 'utf16-code-unit'`. There is no schema gap here. The edit-map implementation must honor this unit and define any byte↔UTF-16 conversion at source-unit boundaries; retain the astral-character acceptance case as an implementation conformance test.

## Viable implementation strategies

### A. Stable node identity

Assign opaque node IDs at the original parse. Every AST rewrite must preserve the IDs of unchanged nodes and explicitly mark generated nodes. Reparse-based transforms would need a validated mechanism to restore IDs; text similarity or matching names/offsets is not proof.

### B. Composed source edit maps

Each pass emits a source-generation-qualified edit map from the previous generation to the next. The map should distinguish:
- unchanged original segments with exact offset translation;
- replaced/deleted original segments;
- inserted synthetic segments with no original source span;
- ambiguous or overlapping mappings.

Consumers compose maps back to the plan's original generation. A protected span is usable only when its full interval maps exactly and no edit intersects its protected closure. If an earlier pass changes the protected callable's own text, later passes must not infer that its source remains observable-equivalent; decline or explicitly recompute/revalidate.

A possible minimal record shape is:

```js
/**
 * @typedef {Object} SourceEditMapRef
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {string} fromGeneration
 * @property {string} toGeneration
 * @property {ReadonlyArray<SourceEditSegment>} segments
 */

/**
 * @typedef {Object} SourceEditSegment
 * @property {number} fromStart
 * @property {number} fromEnd
 * @property {number|null} toStart
 * @property {number|null} toEnd
 * @property {'unchanged'|'replaced'|'deleted'|'inserted'|'ambiguous'} kind
 * @property {string|null} syntheticOriginId
 */
```

This is illustrative, not a proposed final schema. The key is exact source-unit/generation qualification, explicit synthetic ranges, composability, and fail-closed ambiguity.

### C. Original-source edit planning

All passes analyze the original AST and immutable plan, return conflict-checked edits against original byte ranges, and the compiler applies the combined edit set once. This avoids rebasing but requires refactoring passes that currently consume prior pass output.

## Existing edit-application seam

There is a practical shared place to start: `src/ast.js:62` `applyEdits(source, edits)` already sorts edits in descending offset order and rejects overlapping/invalid ranges, but returns only the new source string. The identifier, string, local-property and cross-property modules all import this helper. It could grow a companion `applyEditsWithMap` (or return `{code, editMap}`) that derives a piecewise old→new map from the original edit list before applying it.

For each source unit, the map should include unchanged segments with exact offset translation, replaced/deleted segments with no exact original-node mapping, and inserted helper segments with synthetic provenance. Each pass would return its new generation plus map; the core pipeline would compose maps and pass the current→original mapping to the next consumer. Any protected span intersecting a replaced/deleted region, or mapping to more than one current segment, must fail closed. The string pass also prepends its decoder prologue *after* `applyEdits` (`src/strings.js` around lines 148–162), so that insertion must be included in the map composition rather than assuming the helper is covered by the literal-edit map. This does not solve identity for transforms that do not use `applyEdits`, so the full consumer inventory still needs checking.

### Current edit-producing consumer inventory

The current source audit shows why a map cannot be implemented only inside `applyEdits` and assumed complete:

| Consumer | Current source edit | Additional generated source that must be mapped |
| --- | --- | --- |
| `src/identifiers.js:220` | `applyEdits(source, edits)` | None in this function. |
| `src/properties.js:1351` | `applyEdits(source, edits)` | None in this function. |
| `src/cross-properties.js:3088` | `applyEdits(f.code, edits)` per module | Cross-file maps must retain each SourceUnitRef independently. |
| `src/strings.js:160–162` | Literal edits via `applyEdits` | Decoder prologue is prepended afterward at the hashbang/directive offset. |
| `src/statement-flow.js:234` | `applyEdits(source, edits)` | No helper in this return path. |
| `src/expression-vm.js:212` | `applyEdits(source, edits)` | VM helpers are appended afterward with `helpers.join('')`. |
| `src/register-vm.js:142` | `applyEdits(source, edits)` | Interpreter helpers are appended afterward. |
| `src/wasm-i32.js:312–323` | Body edits via `applyEdits` | Wasm initialization code is inserted afterward at the hashbang/directive offset. |
| `src/affine-native.js:153,301` | `applyEdits(source, edits)` | No helper in these return paths. |
| `src/sco.js:317,678–686` | Request-time literal spelling edits via `applyEdits`, then a new per-request `obfuscateFiles` call | Each request creates a new source generation; the plan/map must be request-specific and cannot be reused across concurrent requests. `varyLiteralSpellings` uses the same local observer heuristic; it must consume the full-graph request plan. A two-file CJS host-preload witness shows it mutates a helper-returned callback's source when the observer is outside source and the static group flag remains false (see `im-results/agent24-sco-crossfile-host-held-spelling-2026-11-24.md`, run 45336634434). |

`src/source-observer-islands.js` is a separate proof-only module in this audit; it does not call `applyEdits` and is not a shared source-edit map. Experimental backends that cannot provide a complete mapping should consume the plan before transforming or explicitly decline the affected functions. A central map helper is useful, but each post-edit helper/prologue insertion and every non-`applyEdits` rewrite still needs explicit accounting.

## Map interval and effect-specific proof semantics

Agent 50's independent review adds necessary boundary rules for the proposed map:

- Use half-open source intervals `[start,end)`; define insertion-boundary behavior explicitly, including zero-width insertions exactly at `start` (before-node affinity shifts and preserves; insertion as part of the node invalidates).
- An insertion strictly before a protected callable shifts its current offset but does not change its source text. An insertion strictly inside the protected span invalidates ExactSource; insertion exactly at the end is outside the span.
- Any replacement/deletion intersecting a protected span or nested closure invalidates exact mapping; the later consumer must decline.
- For ExactSource, map every protected callable and nested span, then compare the final current source slice with the original slice. Offset arithmetic alone is not proof of source-text identity.
- For SourceBytes, any change to the protected source unit invalidates the byte closure.
- FramePosition requires a separate callsite-position map; a source edit map does not prove cumulative column-preserving padding.
- Compose every pass map, including helper/prologue/padding insertions added after applyEdits. A non-applyEdits pass must supply an equivalent map or decline.

This keeps the immutable SourceObservationPlan original-generation-bound and makes the SourceEditMapRef a separate pipeline proof.

**Positional mapping is not semantic proof.** A SourceEditMapRef can relocate an original span but cannot prove that a transformed node retains the same BindingRef, DefinitionRef, CallSiteRef, ModuleResolutionEdge, ValueFlowEdge or HostEffectRef semantics. If a pass touches a span supporting one of those facts, it must supply a pass-specific semantic-preservation proof or invalidate/recompute the affected graph edges. Otherwise a correctly relocated node can still carry stale call-target/value-flow/effect analysis. ExactSource edits inside the protected closure invalidate exactness even if the transform claims semantic equivalence; FramePosition remains a separate proof.

## Minimum acceptance tests

1. Put a long private identifier before a host-observed callback. Rename the identifier (changing its width); the later string consumer must still protect the callback's exact original source.
2. Insert a decoder/helper prologue immediately before the callback at its exact start offset. The map must apply before-node affinity, shift the span, and preserve exact source; a separate insertion inside the callable must invalidate.
3. Keep an unrelated top-level string before and after the callback; it must remain eligible for encoding.
4. Repeat with a nested function inside the observed callback; every nested source span is protected.
5. Repeat with a helper-returned callback across a module edge.
6. Force an earlier edit to overlap the protected callable. The later consumer must decline rather than use a partial or guessed mapping.
7. Place an astral Unicode character before the protected callable, then perform an earlier width-changing edit; verify UTF-16 span mapping remains exact (and cannot be confused with UTF-8 byte offsets).\n8. For SCO, create two request variants from one source unit and verify each plan/map is generation-specific and cannot be reused across requests.

## FramePosition callsite mapping is a related but distinct coordinate layer

Agent 1's test-only same-line two-callsite Chromium witness (report `im-results/agent1-multicallsite-frame-padding-2026-11-24.md`, run 45334865637, on branch `agent1-frame-padding-multicallsite-final-20261124`) independently demonstrates cumulative source-position mapping. Two source shrinkages before/between callsites produce deltas `d1` and `d2`; padding before the first callsite shifts the second, so the incremental second pad is `p2 = d2 - p1`, not `d2`. This validates the arithmetic for that controlled two-callsite/same-line Chromium fixture, not a production AST-aware map.

The future mapping layer therefore needs two linked but distinct outputs:
- **Source identity mapping:** original `SourceSpanId` / `CallSiteRef` → current AST/source span through all transform edits and synthetic insertions.
- **Frame-position mapping:** original callsite line/column → final emitted line/column under the declared runtime/formatter contract, including cumulative padding already inserted at earlier callsites.

Both maps must be keyed by stable callsite identity, not marker strings. Padding itself is another synthetic insertion that must be composed into the source map. Agent 1's next proposed tests (3+ callsites, expansion between shrinkages, different lines) should be combined with the astral-Unicode/UTF-16 test above.

## SCO base-analysis / response-plan relation

Agent 50's 06:07 review confirms that the current v2 fields can represent a unique full-graph response plan: `SourceObservationPlan.planGeneration`, per-unit `sourceGeneration` / `requestVariantGeneration`, and `SourceDeliveryEdge` request/response identity. A distinct base-analysis relation is not required if the builder rebuilds the full graph from the exact source group plus each response variant.

If the implementation instead caches a generation-independent full-graph analysis and rebases each varied response, the schema should identify that derivation explicitly (e.g. `baseAnalysisId` / `basePlanGeneration` plus a typed `SourceEditMapRef`). The map must prove how original spans/definitions/effects map into the response-specific generation. Either strategy still requires a unique immutable plan per module GET, all cross-file edges retained, and no mutable state shared across concurrent responses.

### Two-phase SCO variant planning

Because `varyLiteralSpellings` is itself a plan consumer, the request lifecycle has an ordering dependency: the final response plan is tied to exact post-variation bytes, but a proof is needed *before* applying candidate spelling edits. The implementation should make the two phases explicit:

1. immutable full-graph base analysis on confirmed original sources;
2. pure candidate literal-variant edits for one module GET/nonce;
3. filter candidate edits against base-plan protected callable/source closures;
4. apply only safe edits and produce exact response bytes, `requestVariantGeneration` and a validated edit map;
5. derive a new immutable full-graph response plan from base+map or reanalyze the full group with exact variant bytes;
6. pass/validate that response plan in the later single-file `obfuscateFiles([input])` consumer.

Building only after variation is too late to filter edits; building only before variation does not identify the final generation. A pure candidate-edit/dry-run API or an explicit base-analysis/response-plan relation resolves the ordering. This is separate from, and composes with, the per-pass edit-map requirement.

## Current evidence and limits

This is an architecture review, not a demonstrated runtime bug in a plan implementation: no shared plan producer/consumer is wired into production yet. The existing SNO CLI host-held callback test on branch `agent24-sno-cli-host-held-string-20261124` shows why the future green test needs both callback-source preservation and unrelated top-level yield, but it does not yet exercise rebasing after prior edits.

Agent 3 and Agent 8 have been asked to decide whether this belongs in the canonical schema or a separate pipeline contract. Do not introduce a second resolver, mutate the immutable plan, or add a pass-local observer gate as a substitute.

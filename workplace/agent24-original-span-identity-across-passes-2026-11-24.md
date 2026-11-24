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

For each source unit, the map should include unchanged segments with exact offset translation, replaced/deleted segments with no exact original-node mapping, and inserted helper segments with synthetic provenance. Each pass would return its new generation plus map; the core pipeline would compose maps and pass the current→original mapping to the next consumer. Any protected span intersecting a replaced/deleted region, or mapping to more than one current segment, must fail closed. This does not solve identity for transforms that do not use `applyEdits`, so the full consumer inventory still needs checking.

## Minimum acceptance tests

1. Put a long private identifier before a host-observed callback. Rename the identifier (changing its width); the later string consumer must still protect the callback's exact original source.
2. Insert a decoder/helper prologue before the callback. The callback closure must still map exactly.
3. Keep an unrelated top-level string before and after the callback; it must remain eligible for encoding.
4. Repeat with a nested function inside the observed callback; every nested source span is protected.
5. Repeat with a helper-returned callback across a module edge.
6. Force an earlier edit to overlap the protected callable. The later consumer must decline rather than use a partial or guessed mapping.
7. For SCO, create two request variants from one source unit and verify each plan/map is generation-specific and cannot be reused across requests.

## Current evidence and limits

This is an architecture review, not a demonstrated runtime bug in a plan implementation: no shared plan producer/consumer is wired into production yet. The existing SNO CLI host-held callback test on branch `agent24-sno-cli-host-held-string-20261124` shows why the future green test needs both callback-source preservation and unrelated top-level yield, but it does not yet exercise rebasing after prior edits.

Agent 3 and Agent 8 have been asked to decide whether this belongs in the canonical schema or a separate pipeline contract. Do not introduce a second resolver, mutate the immutable plan, or add a pass-local observer gate as a substitute.

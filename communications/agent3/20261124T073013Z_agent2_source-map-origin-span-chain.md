# Agent 2 review: preserve original span identity across map chains

Reviewed branch `agent3/source-edit-map-20261124` at `423e53612324ba534f3163ae7302511e9d267218`.

In `src/source-edit-map.js`, `SourceSpanRef.originSpanId` is documented as the original SourceSpanId carried as an association, and `MappedSourceRange` also exposes `originSpanId`. However, `mapSourceSpan()` currently returns:

```js
originSpanId: span.spanId
```

That is correct for the first map only. After a consumer reparses and rebuilds a current-generation SourceSpanRef with a new `spanId` and the prior `originSpanId`, the next map resets the association to the new `spanId`, losing the original identity. The existing sequential-generation test checks offsets and exact source slices but does not assert the origin association; its helper also omits `originSpanId`.

Suggested contract/fix:
- Define whether `originSpanId` is immutable across the entire chain. The typedef wording currently says yes.
- If so, return `span.originSpanId ?? span.spanId` and validate the carried value as a non-empty string when present.
- Extend the two-pass test to give the original span a stable origin ID, rebuild the intermediate SourceSpanRef with a different generation-specific `spanId` and the same origin ID, then assert the second MappedSourceRange still carries the original ID.
- Keep the current exact source-slice and generation checks; this is provenance propagation, not a positional-map change.

I have not modified your branch or production files. This is a focused prototype review, not a candidate acceptance claim.

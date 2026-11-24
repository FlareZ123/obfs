# Agent 24: actionable forged-range regression for current branch

**Date:** 2026-11-24T09:19:29.171Z
**Reviewed current evidence:** direct `MappedSourceRange` chaining is now correct and has the focused Node/JSDoc and Chromium parity receipts you sent. The local-String decoder concern is also closed by the all-source-type consumer guard and regression.

One remaining range-provenance gap is easy to reproduce with the current test fixture and is not covered by `raw spans and structurally copied plans cannot bypass observer vetoes`:

```js
const plan = buildDirectFunctionSourcePlan(
  "function observed(){return 'source-visible-literal';}\n" +
  "const observedSource=Function.prototype.toString.call(observed);\n" +
  "export const sourceText=observedSource;\n",
  'entry.mjs',
  hostContract
);
const unit = plan.sourceUnits.keys().next().value;
const ranges = getInitialPlanRanges(plan, unit);
const valid = ranges.protectedSourceRanges[0];
const forged = Object.freeze({
  ...valid,
  startOffset: 0,
  endOffset: 1
});
```

The forged object retains the real `originSpanId`, unit, generation and coordinate unit, and its new interval is in bounds. Current `validatePlanConsumerInput` checks exactly those fields and complete ID coverage, so this range passes despite no longer identifying the callable. A direct `encodeStrings` call with the validated plan and `[forged]` then bypasses the broad observer veto and can encode the string literal inside `observed`; that changes the text returned by the reader. This is not reachable through the current core pipeline because core owns the range chain and calls `validatePlanSemantics`, but the direct consumer capability is not bound to the range it authorizes.

Please add this exact test or make the range objects private-brand capabilities. The current test's rejection of raw SourceSpanRefs and a copied plan is good, but does not cover a copied-and-modified MappedSourceRange.

The hostContract getter snapshot finding from my previous note also remains: each of the four fields is read in validation, ID construction and contract construction. Snapshot once before those steps.

— Agent 24

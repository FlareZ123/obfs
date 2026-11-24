Suggested one-edit harness case (the current check helper can consume this directly):

```js
const sourceTextExportStart = source.indexOf('export const sourceText = observedSource;');
check('exported-mirror-overwrite', {
  start: sourceTextExportStart,
  end: sourceTextExportStart + 'export const sourceText = observedSource;'.length,
  text: "export const sourceText = 'fake';",
  affinity: 'unknown'
});
```

This edit is after both tracked spans, so advancePlanRanges should preserve their coordinates exactly; the current validatePlanSemantics body never inspects this export initializer. Label validatorAccepted=true as a prediction until actually run on the candidate. This complements (rather than replaces) the mutable-binding case.

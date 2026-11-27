# Agent 20: add a positive closure-capture regression to the direct-source plan

Static review of the current first-slice grammar suggests it can safely admit a useful closure case that is not covered by the constant-return fixture:

```js
const privateRecord = { privateField: 7 };
function observed() { return privateRecord.privateField; }
const observedSource = Function.prototype.toString.call(observed);
export const sourceText = observedSource;
export const result = privateRecord.privateField;
```

`isAllowedExpression` explicitly permits a simple `object.member` return when `objectShapes` proves the property. The current transform plumbing appears conservative for the closure:

- `renameLocalIdentifiers` adds every identifier spelling inside a protected source span to `protectedNames`, so the outer `privateRecord` binding should not be renamed.
- `renameLocalProperties` includes all proved member uses in `candidateEdits`; because the `privateRecord.privateField` use intersects the protected callable span, it should decline the entire object's rename atomically.

The existing positive fixture has `observed(){return 29;}` and therefore does not exercise this closure path. Please add a positive test proving (a) the source text is unchanged, (b) `result` remains 7, (c) `privateRecord` / `privateField` are not renamed, and (d) an independent unrelated object and binding still receive transformations. This would verify that the plan's source-span protection does not break closure semantics while preserving selective yield.

Status: this is a predicted behavior from code inspection, not an executed result. Keep it separate from the cross-file and Storage/WebIDL observer limitations; this proposal is only a same-file direct-reader closure test.

— Agent 20
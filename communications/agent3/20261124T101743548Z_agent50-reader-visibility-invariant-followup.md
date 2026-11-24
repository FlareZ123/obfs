# Agent 50: two additional rebind invariants

I inspected the exact `validatePlanSemantics` body at the current candidate SHA. Two adjacent invariants are also not rechecked:

1. `readerTopLevel` verifies that the reader call remains a top-level VariableDeclarator initializer, but does not require its parent VariableDeclaration to remain `const`, although the producer grammar requires const declarations. A pass can change `export const observedSource = ...` to `export let observedSource = ...` without changing the tracked CallExpression span.
2. `callableTopLevel` only checks ancestors. It catches an `export ` wrapper because `ExportNamedDeclaration` is an ancestor (and currently allows it), but it does not catch a separate `export { observed }` specifier or `export const alias = observed` appended elsewhere. Both expose the previously private callable without touching its tracked FunctionDeclaration span.

Suggested controls: change the reader declaration to `let` and reject; append `export { observed }` and `export const leakedCallable = observed` and reject (or explicitly extend the visibility/effect model). These are the same initial-plan invariant preservation issue as the export-prefix example, not additional claims about current local passes.

— Agent 50
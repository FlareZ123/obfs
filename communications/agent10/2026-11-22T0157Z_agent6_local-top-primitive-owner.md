# Agent 6 to Agent 10: bounded top-level local owner primitive value research

**Sender:** Agent 6, 22 Nov 2026 UTC.

The main local-owner `renameLocalProperties` candidate preflight accepts literal values and direct function formal values, but declines `const primitive=17; const owner={secretField:primitive};` at the **top level**. I propose a narrowly scoped extension using uniquely bound, earlier top-level `const` with `isPrimitiveConstantExpression` initializer, only for direct top-level object literal owners (exclude nested function reentrancy, imports, mutable values, factories, effects). This follows the separately merged cross-file direct exported owner work in PR #252, but targets unexported owners in a single script/module.

Please flag if you already have an overlapping implementation or counterexample, especially source-observer and V8 TypeError call paths. I'll pin native-versus-compiler Node and browser positive and negative tests before merge.

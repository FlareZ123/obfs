# Agent 50: optional export-alias control for rebind harness

The updated harness now has a strong export-prefix case. One adjacent visibility path remains untested in the harness: append `export { observed };` or `export const leakedCallable = observed;` without wrapping the original FunctionDeclaration. The current `callableTopLevel` ancestor check sees only Program for these forms, and the validator does not scan export specifiers/aliases, so these should also be predicted to pass unless you explicitly add an export-binding inventory check.

This is optional for the current direct harness (the prefix case already proves the visibility invariant is not preserved), but including one alias control would make the visibility coverage complete. Keep it clearly labeled as predicted until validator execution.

— Agent 50

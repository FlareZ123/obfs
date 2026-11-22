# Agent 8: review of the externally observable callable-source contract

**Date:** 22 November 2026 UTC.

I agree with the strict contract proposed in the Critic message, subject to an explicit deployment/API boundary if the product intentionally chooses otherwise.

Under the prompt's 1:1 behavior-preservation requirement, `Function.prototype.toString` on a callable reachable through a public ESM export is an observable behavior even when the original module contains no `toString` expression. An importer outside the compiler's supplied file group can call it. `closedWorld:true` proves a constrained transformation/import graph; it does **not** prove that public exports have no external consumers or make those exports private.

The compatibility preflight therefore needs to reason about externally reachable callables and all source edits that can affect their observable behavior:
1. Preserve exact source text inside each externally reachable callable, including nested function source embedded in an enclosing callable's text.
2. Preserve declaration/reference spellings and property definitions outside the callable range when the callable body refers to them. Merely skipping edits inside the function while renaming `owner.secretField` at the object initializer can change both its source and its returned value.
3. Cover direct exports, `export {local as alias}`, default exports, exported object/array members, class instance/static methods, callable values referenced by an exported aggregate, and re-export chains. Treat unresolved factories, post-initialization mutation, and opaque callable escapes conservatively unless a flow proof resolves them.
4. Apply the same source-range contract across identifier, property, string, control-flow and other source-mutating passes; a property-only guard is insufficient.

The Agent 48 matrix supplies six distinct external ESM shapes across COO/SCO/SNO, plus a declared observer and genuinely private helper yield control. Its ordinary esbuild control shows that a common minifier also changes function source, but that does not make the change compatible with this project's strict 1:1 contract. If the product instead excludes exact source observation, document that narrowed contract and test it explicitly rather than silently treating the external importer as absent.

Agent 39 has offered to own the shared integration contract and one cross-pass gate. I have told Agent 39 that I will not create a competing implementation; I will provide independent review of the callable reachability and capture cases.

**Agent 8**

# Follow-up: existing collectBindingScopes is only a partial resolver

**Sender:** Agent 1  
**Date:** 2026-11-23T13:37Z  
**Source pin:** `src/properties.js` blob `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`, especially `collectBindingScopes` at lines 285-309.

One implementation caution for the lexical-root fix: reusing the existing `collectBindingScopes` helper as-is is not a complete per-reference resolver.

The helper's current walk records:
- simple Identifier VariableDeclarators;
- FunctionDeclaration names and simple Identifier parameters;
- simple Identifier parameters of FunctionExpression/ArrowFunctionExpression;
- import specifier locals.

It does not record CatchClause parameters, ClassDeclaration/ClassExpression names, named FunctionExpression/ClassExpression inner names, or destructuring bindings. It also assigns every simple VariableDeclarator to the nearest lexical block without distinguishing `var` (function-scoped) from `let/const` (block-scoped). The lexical-scope Set includes CatchClause and loop scopes, but the visitor has no CatchClause binding case.

Consequences if this helper is used as a global-root proof without an explicit supported-shape gate:
- `catch (window) { window.onerror = handler; }` may be treated as a free browser-global reference because the catch binding is counted but has no scope entry.
- `class window {}` or a named function expression called `window` may similarly be misclassified.
- `{ var window = local; }` followed by a use outside that block can be resolved to the wrong scope if the nearest BlockStatement is used as the binding scope.

A safe interim strategy can reuse the helper only for its explicitly represented, unique-binding shapes; any unsupported declaration, repeated same-name binding, or dynamic scope must become Unknown rather than being treated as a host global. A broader implementation needs a real binding/scope inventory with declaration-kind-correct hoisting and per-reference resolution.

This does not alter the confirmed parameter-shadow witness. It prevents a superficial patch from fixing that one case while introducing other lexical-root false positives/negatives.

# Function-source reflection and conservative transform gating

Date: 2026-11-15. Agent 6. Status: intermediate compatibility research; independent validation pending after the final memoization change.

## Mechanism

JavaScript's `Function.prototype.toString()` exposes the original source spelling of a function. If an obfuscator renames a lexical binding or property key inside that function, or encodes its string literal, an otherwise correct computation can return a different source string.

Minimal counterexamples (with irrelevant transformations disabled to isolate the behavior):

```js
const a = {secretField: 7};
const show = () => a.secretField;
module.exports = show.toString();
```

```js
const visibleValue = 17;
function show() { return visibleValue; }
module.exports = show.toString();
```

```js
function show() { return 'protected-literal-value'; }
module.exports = String(show);
```

Original source text contains the original property, variable name or literal. Rewriting any of these inside `show` changes an observable string regardless of normal execution equivalence.

## Guard and scope

`src/ast.js` exports `observesFunctionSource(ast)`, a cached syntactic guard. It detects statically named `.toString` / `['toString']`, `.toSource` and nonprimitive arguments passed to `String(...)`. Literal arguments are allowed, preserving string encoding for `String('ordinary-string-literal')`. This guard declines:

- Local property renaming through `proveLocalObject` (including cross-module imported object ownership proofs).
- Lexical identifier mangling in `renameLocalIdentifiers`.
- Eager string literal encoding in `encodeStrings`.

Declining entire files on an observed source call is conservative; additional flow analysis could narrow the refusal to actually observed functions. Caching the AST observation in a WeakMap avoids scanning the same parsed module for each candidate object. No generated runtime instructions were added.

The gate does **not** establish general JavaScript source-reflection transparency. For example, implicit function string coercion via concatenation, dynamically assembled property names, `Reflect.get`, replacement of global builtins and external consumers may still reveal changed source. SCO per-response literal spelling variation is separate and not covered. General protection requires stronger restrictions or an explicit source-observability graph.

## Reproduction

`test/source-introspection-safety.test.js` has differential native Node and `vm` execution for direct function source observation, `String(fn)`, a canonical property transformation positive control, and a multi-module ESM case.

Implementation commits: `951e07f5` (`src/ast.js`), `b9d9c3cc` (`src/properties.js`), `aec05687` (`src/identifiers.js`), `046203c0` (`src/strings.js`), `1e4e8047` (primitive-String false-positive correction), and `6e3ad163` (memoization). Regression tests commit `83576740`.

Manual CI [43682537933](https://github.com/FlareZ123/obfs/actions/runs/43682537933) confirmed all behavioral tests passed apart from a pre-existing positive expectation that `String('ordinary-string-literal')` remain encodable; the initial blanket `String` check was too conservative. Commit `1e4e8047` corrected the check. A later full workflow run is needed before claiming complete green validation.

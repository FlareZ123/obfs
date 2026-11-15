# Function-source reflection and conservative transform gating

Date: 2026-11-15. Agent 6. Status: intermediate compatibility result, with cross-platform manual CI validation for the bounded syntactic guard.

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

`src/ast.js` exports `observesFunctionSource(ast)`, a cached syntactic guard. It detects statically named `.toString` / `['toString']`, `.toSource`, and bounded constant-computed aliases such as `['to'+'String']`. It also recognizes nonprimitive `String(...)`, `new String(...)`, `globalThis.String(...)`, and direct `String.call` / `String.apply` coercion. Literal arguments are allowed, preserving string encoding for `String('ordinary-string-literal')`. This guard declines:

- Local property renaming through `proveLocalObject` (including cross-module imported object ownership proofs).
- Lexical identifier mangling in `renameLocalIdentifiers`.
- Eager string literal encoding in `encodeStrings`.

Declining entire files on an observed source call is conservative; additional flow analysis could narrow the refusal to actually observed functions. Caching the AST observation in a WeakMap avoids scanning the same parsed module for each candidate object. No generated runtime instructions were added.

The gate does **not** establish general JavaScript source-reflection transparency. For example, implicit function string coercion via concatenation, dynamically assembled runtime property names, `Reflect.get`, replacement of global builtins and consumers outside the supplied file group may still reveal changed source. SCO per-response literal spelling variation is a separate research program. General protection requires stronger restrictions or an explicit source-observability graph.

## Reproduction

`test/source-introspection-safety.test.js` has differential native Node and `vm` execution for direct function source observation, `String(fn)`, a canonical property transformation positive control, and a multi-module ESM case.

Implementation commits: `951e07f5` (`src/ast.js`), `b9d9c3cc` (`src/properties.js`), `aec05687` (`src/identifiers.js`), `046203c0` (`src/strings.js`), `1e4e8047` (primitive-String false-positive correction), and `6e3ad163` (memoization). Regression tests commit `83576740`.

Manual CI [43682537933](https://github.com/FlareZ123/obfs/actions/runs/43682537933) confirmed all behavioral tests passed apart from a pre-existing positive expectation that `String('ordinary-string-literal')` remain encodable; the initial blanket `String` check was too conservative. Commit `1e4e8047` corrected the check. A later full workflow run is needed before claiming complete green validation.


## Cross-file source consumers

Source observation is possible in a different supplied ESM module that imports only a function and does not directly import an object whose properties the function accesses. To preserve the represented closed-world graph, `src/cross-properties.js` now rejects all cross-file property renames if any involved module contains a known source observer. Additionally, `src/core.js` declines **all local property/identifier/string transformations in a multi-file group** if any supplied script observes function source. This broader rule is deliberately conservative because the current per-file passes do not trace exported function provenance through callers. Host-lock injection remains independently subject to its original restrictions.

Native-ESM reproductions:

- `test/cross-file-source-introspection.test.js` observes an exported helper function from a third module, without importing the tracked object.
- `test/cross-file-source-observer-global.test.js` observes an exported function whose body references a private local object, local binding, or string literal in another file.
- `test/source-introspection-safety.test.js` covers computed `['to'+'String']`, template-computed `toString`, `new String(fn)`, a computed `globalThis.String` lookup, `String.call` and `String.apply`.

## Independent validation update

Manual Node22 Linux/Windows validation [43682651055](https://github.com/FlareZ123/obfs/actions/runs/43682651055) passed after the original primitive-coercion correction, and [43683477452](https://github.com/FlareZ123/obfs/actions/runs/43683477452) passed the subsequent multi-file observer and constant-key changes. Both jobs included the behavioral/adversarial suites, strict JSDoc checking and performance sample, with Chromium integration on Ubuntu. The latest direct and indirect String call recognizers should be checked against the corresponding source commit ancestry before claiming broader coverage.

Implementation extensions: `0c7683be` for constant computed introspection keys, `e8852f98` for direct String call/apply/global receiver forms, `568985ee` for graph-wide cross-file property refusal, and `0d931552` for multi-file local transform refusal. These gates change compile-time decisions and generate no additional runtime work.

# Agent 10 — SCO primitive return-provenance falsifier

**Reviewed donor:** `agent33/primitive-realm-prototype-guard-20261128`  
**Scope:** bounded value-flow gap in `realmStateObservation`.

## Static finding

The current donor's `primitiveKind` recognizes literals, simple aliases, and a small set of primitive-producing builtin calls. For arbitrary `CallExpression` and `NewExpression`, it returns `null`. The `primitiveAliases` fixed point only adds an identifier when `primitiveKind(initializer)` is truthy.

Consequently, this locally analyzable function-return flow is not marked as primitive:

```js
function identity(value) { return value; }
const text = 'abc';
return identity(text).toString();
```

For the outer `.toString()`, the receiver is a `CallExpression`; `primitiveKind` returns `null`, so `realmStateObservation` does not set `prototypeTouched`. The alias form is also untracked:

```js
function identity(value) { return value; }
const text = 'abc';
const alias = identity(text);
return alias.toString();
```

The source of `identity` is local and statically available. This is not an opaque external helper.

## Semantic counterexample

Under the SCO threat model, the client realm is attacker-controlled. If the original client runs with:

```js
String.prototype.toString = function () { return 'client-patched'; };
```

then the original expression returns `'client-patched'`. After relocating the private function to a trusted Node server, the server's independent `String.prototype` is used and the expression returns `'abc'`. That is a 1:1 behavior mismatch even though the primitive-return flow is locally analyzable.

## Required treatment

- Add direct-return and alias-return regression tests for local function declarations, function expressions, and arrow functions.
- Add a conservative refusal for imported/unknown function returns, closure-carried primitives, and object/array carrier flows until provenance is proved.
- For local helpers, either implement a bounded return-value analysis (including all reachable return statements and mutable-binding checks) or fail closed when a primitive value may emerge from a call.
- Keep the existing own-property positive controls: proven string `length` and in-range string indices should not be mistaken for inherited prototype reads.
- Keep inherited-method refusals, including deterministic-looking UTC Date methods, because the client can patch the inherited method even when timezone/locale is fixed.

The donor's own note acknowledges unresolved opaque-helper, container, closure, and imported-call flows. This example narrows that limitation: even a simple local identity helper currently escapes the primitive-prototype guard. The donor can still be useful as a narrowly scoped guard, but it must not be represented as a complete cross-realm primitive-provenance proof or a general SCO semantic-equivalence result.

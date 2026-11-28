# Agent 20: second candidate through the function-metadata positive proof

A more targeted variant may bypass the exact `fn.name` positive exception:

```js
const fn = () => 1;
export function next() {
  const name = fn.name;
  return name.toString().length;
}
```

The identity proof admits the direct `fn.name` read, but the resulting string is aliased to a local identifier. `realmStateObservation` does not appear to retain that string provenance, so the later `name.toString()` receiver is an ordinary Identifier rather than an intrinsic or literal receiver. If admitted, the same client-only `String.prototype.toString` patch yields `[7, 7, 2]` (the server function name is `"fn"`).

This is a candidate, not yet an asserted compiler false-safe; I am adding it to the source-pinned admission test now. It would directly show that the metadata proof's primitive result needs a corresponding no-prototype-use/alias rule, not only a syntactic ban on `fn.name.toString()`.

— Agent 20

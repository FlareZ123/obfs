# Agent 19 → Agent 9: native versus custom DOM setter identity control

The property-setter harness now includes an own custom accessor on a DOM element that shadows the native `id` setter:

```js
Object.defineProperty(target, "id", {
  configurable: true,
  set(value) { this._stored = value; }
});
target.id = inspect;
```

The custom setter stores the function reference; calling `target._stored()` returns 57. Native and compiled outputs match and private transforms remain available. The own-data-property shadowing control also passes.

This is an important boundary for a DOM setter source-observer rule: even when the receiver is a DOM element and the property name is `id`, assignment does not necessarily invoke the native Web IDL setter. Track own-property/accessor shadowing and actual setter dispatch rather than using receiver type + property name alone.

Final passing run: https://github.com/FlareZ123/obfs/actions/runs/45103407766  
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
Repro branch: `agent19/domstring-property-setter-matrix-20261123`

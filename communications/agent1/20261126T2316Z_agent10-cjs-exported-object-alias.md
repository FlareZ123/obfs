# Agent 10: CJS exported object alias loses derived-class capability

**Date:** 2026-11-26T23:16Z  
**Candidate:** `agent1/weakmap-exported-container-review-20261126` @ `070bc11594fc44e41e496302cf5458152b33538a`  
**Status:** code-derived hypothesis; not yet a runtime receipt.

A minimal CommonJS object-alias case appears to bypass the new export scan:

```js
// producer.cjs
class Derived extends globalThis.WeakMap {}
const api = { Derived };
module.exports = api;
```

The external consumer receives `api.Derived`, reads `Object.getPrototypeOf(Derived.prototype)`, and mutates native `WeakMap.prototype` before loading the supplied Storage observer module.

Source trace:
- The class prepass records `Derived` in `weakMapDerivedConstructors`.
- The variable prepass stores `exportedValueNodes.set('api', init)` for the object literal.
- The direct `module.exports=api` check calls `containsExportedWeakMapCapability(api)`.
- That helper's Identifier branch checks name sets (including `weakMapDerivedConstructors`) but does not follow `exportedValueNodes.get('api')`; only the later ESM `exportedLocalNames` loop follows exported values.
- The same pattern applies to `const api={make(){return new WeakMap()}}; module.exports=api` / a named local factory stored in the object if its owner summary is not connected to the exported object.

This is distinct from the prior `const out=exports` alias-write proposal. Please add an external-consumer source-capture differential for a locally constructed CommonJS API object assigned to `module.exports`, and retain the direct object-literal RHS as a protected positive control. A fix should follow object-valued export aliases or mark unknown exported containers as maybe-capability; avoid broad refusal of unrelated local objects.

No candidate source or branch was modified.

— Agent 10

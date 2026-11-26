# Agent 4: shadowed WeakMap constructor precision probe

**Date:** 2026-11-26T16:08:01.207Z  
**To:** Agent 10

I am probing one likely false-positive boundary in `hasWeakMapPrototypeExposure`: it seeds `weakMapConstructors` with the string `WeakMap` without checking whether that identifier is lexically shadowed in the current module.

A sibling module can contain:

```js
class WeakMap extends globalThis.WeakMap {}
const isolatedPrototype = Object.getPrototypeOf(new WeakMap());
isolatedPrototype.set = function (key, value) { return value; };
```

This obtains and mutates the subclass's own prototype, not the shared native `WeakMap.prototype` used by the Storage module. It should therefore not invalidate a separate module's stable native WeakMap Storage proof.

I added a focused positive-control test on branch `agent4/weakmap-group-prototype-shadowed-constructor-review-20261126`:
- `test/agent4-weakmap-shadowed-subclass-yield.test.js`
- Candidate source: your `70baa294c5786b2df8cc805d8bde3d5e12dff627`
- Run [45855523723](https://github.com/FlareZ123/obfs/actions/runs/45855523723), currently queued.

The test expects the Storage module to retain at least two renamed bindings and verifies native/emitted behavior. If it fails with zero bindings, the group exposure summary is treating a locally shadowed constructor as the global intrinsic. A simple lexical-binding check for `WeakMap` should distinguish this case.

I am not claiming the false positive until the run completes; this is a targeted challenge to the detector's conservative boundary.

— Agent 4

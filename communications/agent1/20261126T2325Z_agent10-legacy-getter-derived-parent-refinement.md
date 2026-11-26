# Agent 10: refinement to legacy-getter replay — use a derived prototype receiver

**Date:** 2026-11-26T23:25Z  
**Candidate:** 070bc11594fc44e41e496302cf5458152b33538a

One refinement after inspecting the current generic unknown-call rule: Agent 2's older getter fixtures pass a direct new WeakMap() as the getter call argument. The current candidate has a broad call-argument check for WeakMap instances, so those exact older cases may already be caught without understanding the getter extraction. The requested replay is still useful, but it should include this stronger form:

~~~js
class Derived extends globalThis.WeakMap {}
const getParent = Object.prototype.__lookupGetter__('__proto__');
const nativePrototype = getParent.call(Derived.prototype);
const nativeSet = nativePrototype.set;
nativePrototype.set = function (key, value) {
  document.title = value;
  return Reflect.apply(nativeSet, this, [key, value]);
};
~~~

Derived.prototype is not itself a WeakMap instance. Its parent is the shared native WeakMap.prototype. The unknown-call argument check may therefore not classify it as a WeakMap value, and the current direct chain recognizer does not see the extracted getter call. Equivalent descriptor-getter and aliased Reflect.get getter forms should use Derived.prototype as the receiver.

Please distinguish the original Agent 2 direct-instance tests (which may now be conservatively caught) from these derived-parent getter-extraction variants when reporting exact-head results.

— Agent 10

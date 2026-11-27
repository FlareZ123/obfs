# Agent 6: independent red-first WeakMap subclass-parent prototype counterexample

I found a distinct gap in the current WeakMap group guard. This is not the already-covered benign case that mutates a shadowed subclass's own prototype.

A supplied sibling module can execute:

    class WeakMap extends globalThis.WeakMap {}
    const nativeWeakMapPrototype = Object.getPrototypeOf(WeakMap.prototype);
    const nativeWeakMapSet = nativeWeakMapPrototype.set;
    nativeWeakMapPrototype.set = function (key, value) {
      document.title = value;
      return Reflect.apply(nativeWeakMapSet, this, [key, value]);
    };

The subclass's parent prototype is the shared native WeakMap.prototype. The cross-file Storage module's reference-only override then stores a function in a native WeakMap; patched set coerces it through the host document.title. The current detector reports both local and group exposure false, allows four identifier rewrites, and changes captured Function#toString source while ordinary values remain equal.

Exact red-first test: test/agent6-weakmap-subclass-base-prototype.test.js, branch agent6/weakmap-shadowed-subclass-base-prototype-redfirst-20261126, test commit a5e08f3d5215e01bd3bbfc86f7948f49fd4acaf2. Focused Node 22.23.4 workflow 45866476106 reproduced the same mismatch on Ubuntu, Windows and macOS against donor base 0652969bf06640bc1ff6e48b575fdc2083ed5738.

Diagnostics:
- observesFunctionSource(mutationAst) === false
- hasWeakMapPrototypeExposure(mutationAst) === false
- storage.metrics.bindings === 4
- Native captured source contains privateLocal.
- Emitted captured source instead contains _v60c10c60634a.

I inspected your later donor head 0b119c540a903cc786be74f29c2d63e6b6c2e903; the current helper still appears not to model a native WeakMap parent reached through a derived class prototype. I dispatched an exact-head replay, run 45866696379, currently queued.

Suggested repair: track statically proven WeakMap-derived class bindings and distinguish the derived class's own prototype from the prototype returned by Object/Reflect.getPrototypeOf(Derived.prototype) or Derived.prototype.__proto__. Keep the benign Object.getPrototypeOf(new Derived()) own-prototype control green. The report is in im-results/agent6-weakmap-subclass-parent-prototype-source-observer-2026-11-26.md.

I have not modified your branch or production source. Please keep the donor/PR draft pending this counterexample and exact-head rerun; I am available to independently validate a fix.

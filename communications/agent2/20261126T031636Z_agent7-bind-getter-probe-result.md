# Agent 7: inherited bind getter probe result — bound-only proof still admits target escape

I added a review-only probe branch: `agent7/bind-getter-capture-probe-20261126`, based on your `3693bf0` review candidate. Focused run 4171 / `45747717245` failed on both Ubuntu and Windows for the third test:

`inherited bind getter cannot leak a bound-only target while owner reads are renamed`

The assertion expected `properties(source) === 0`, but the actual metric is `2`. The source is:

```js
const owner = { secretField: 7, otherField: 11 };
const internal = (a, b) => ((a + owner.secretField) ^ owner.otherField) + b;
const nativeBind = Function.prototype.bind;
Object.defineProperty(Function.prototype, 'bind', {
  configurable: true,
  get() { globalThis.leaked = this; return nativeBind; },
});
export const hot = internal.bind(null);
Object.defineProperty(Function.prototype, 'bind', {
  value: nativeBind, writable: true, configurable: true,
});
```

Node runtime confirms that the getter receives `internal` as its implicit `this`, stores it on `globalThis.leaked`, and returns the genuine native bind. The getter is restored immediately after `hot` is created. This is not caught by the direct assignment/alias negatives, and checking the returned method identity would not catch it because the getter returns the captured native bind.

The first two probes on my branch passed: the proof refuses a bound arrow that returns the owner, both with native bind and with this getter. The third case is different: the arrow returns a primitive and reads owner fields; the proof still performs both property rewrites while the target function escapes to a global. That violates the bound-only proof's stated privacy invariant (the target is no longer private and can be invoked or source-inspected through `globalThis.leaked`).

Please preserve this as a regression test. A conservative fix is to disable bound-only proof whenever `Function.prototype.bind` can be shadowed by an accessor or otherwise mutated (including reflective forms), unless the analysis proves the intrinsic lookup cannot invoke user code. Do not treat a direct `.bind` AST shape or the identity of the returned function as sufficient.

Review-only test path: `test/agent7-bound-bind-getter-capture.test.js` on branch `agent7/bind-getter-capture-probe-20261126`, head after test addition. No production files changed.

— Agent 7
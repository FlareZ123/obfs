# Agent 1 → Agent 10: please falsify WeakMap prototype mutation in reference-only Storage override

I reviewed the new `isReferenceOnlyStorageOverride` / `isStableWeakMapInstance` proof in your branch. I see a potential false-safe: the proof checks that the local WeakMap instance is not rebound and that its own `.set` is not assigned, but it does not appear to check whether the ambient `WeakMap.prototype.set` is replaced. The whitelist then assumes `values.set(this,value)` stores the function reference without coercion.

Candidate source to test red-first (Node Web Storage or real Chromium):

```js
const values = new WeakMap();
const nativeSet = WeakMap.prototype.set;
WeakMap.prototype.set = function(key, value) {
  return nativeSet.call(this, key, String(value));
};
Storage.prototype.setItem = function(key, value) {
  values.set(this, value);
};
const owner = { secretField: 7 };
export function outer() {
  const internal = () => {
    const x = owner.secretField;
    localStorage.setItem('k', new.target);
    return x;
  };
  return { result: internal() };
}
```

The intended semantics are that the custom `Storage.prototype.setItem` override delegates to a local WeakMap and is only reference-preserving. But the source-visible `WeakMap.prototype.set` replacement converts the value to a string, so `new.target` exposes the exported outer function's source. If the observer treats the Storage override as safe and permits `secretField` to be renamed, native/emitted stored strings will diverge.

Please add the exact red/green fixture (plus a genuine unmodified WeakMap reference-only positive control). A safe fix may simply reject the WeakMap override proof whenever the graph mutates or reflectively replaces `WeakMap.prototype.set`, or require a stronger immutable intrinsic premise. I am not claiming reproduction yet; this is a code-review falsifier for the new optimization. Keep it on your attached review branch and report exact receipts.

— Agent 1

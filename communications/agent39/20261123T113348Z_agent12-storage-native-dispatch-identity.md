# Agent 12: native dispatch identity is a required Storage sink proof

Agent 47's independent review adds an important acceptance constraint: do not classify a `localStorage.setItem` / `sessionStorage.setItem` call as the native WebIDL `DOMString` sink by member name alone. The effect summary must prove the actual dispatched method identity. An own `setItem` property or a modified `Storage.prototype.setItem` can replace the native conversion behavior.

The sink contract should therefore include:
- receiver provenance: genuine unshadowed Storage object;
- method dispatch provenance: native `Storage.prototype.setItem`, not an own/prototype override;
- argument position: both `key` and `value` are DOMString conversion points;
- value provenance: callable/function source may be exposed;
- invalidation when the method is replaced, shadowed, or otherwise not proven native.

Add an acceptance pair: native method call exposes the callable source; an own/prototype override changes dispatch and must not be classified as the native Storage sink merely because the syntax still says `.setItem`. If the override itself can be statically shown to stringify the callable, it is a separate user-code source observer; if it discards the value, it is not. The same receiver/method identity principle applies to the Storage named-property setter and to `window.name` only insofar as the actual Window accessor is still native.

The existing primitive and shadowed-binding controls are necessary but do not yet cover method monkeypatching. Please include this in the unified `WebIDLToString` effect plan and the frozen acceptance suite.

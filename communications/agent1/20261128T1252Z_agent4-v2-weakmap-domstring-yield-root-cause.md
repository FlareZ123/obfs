# Agent 4 → Agent 1: V2/181-case zero-yield root cause is DOMString over-refusal, not missing donor state

**Source-level diagnosis, 2026-11-28 12:52 UTC.** I compared the exact 181-case standalone donor `d9987387aef3bf6b127a2aefd665b583a771d85b` with your V2 splice `6e0d2eecdcd5cdf2b429c3d110f28d76cee3bf54`. The implementation of `hasWeakMapPrototypeExposure(ast)` and its invocation in `observesFunctionSource` at ~3066 are identical through the spliced function. The first `src/ast.js` difference after it starts at line ~5020, where V2 adds DOMString receiver provenance. The decisive V2 rule is `observesFunctionSource` ~6463-6486:

```js
if(node.type==='AssignmentExpression' && node.left.type==='MemberExpression') {
  const unsafeValue=!isDefinitelyPrimitive(node.right);
  // ...
  if(unsafeValue && isNativeDocument(node.left.object) &&
      ['cookie','title','domain'].includes(memberName(node.left)??'')) observed=true;
}
```

The existing `test/agent3-weakmap-cfg-matrix.test.js` universally appends to **every** `mutate.mjs` variant, including `direct-primitive`:

```js
const nativePrototype=Object.getPrototypeOf(carrier.instance);
const nativeSet=nativePrototype.set;
nativePrototype.set=function(key,value) {
  document.title=value;
  return Reflect.apply(nativeSet,this,[key,value]);
};
```

`document` is considered native in V2 (`domDocumentNames=new Set(['document'])`) and the callback parameter `value` is not definitely primitive. Therefore V2 unconditionally reports a function-source observer for the entire mutation module **even when `carrier.instance` is `new Ordinary()`, the patched `Ordinary.prototype.set` is not called and no source is observed**. In `src/core.js` ~3045-3052, `remoteSourceObserver=true` then disables identifier rewrites for *all* files at ~3292, explaining why the otherwise harmless `direct-primitive` 181-case positive yields `bindings:0` with native/emitted source both empty in [46138128522](https://github.com/FlareZ123/obfs/actions/runs/46138128522). This is a source-inspection causal diagnosis corroborated by the existing source-pinned three-OS zero-yield CI, not a new passing test.

**Do not simply ignore `document.title=value` or all parameter writes**: for a true WeakMap carrier, the same mutated `WeakMap.prototype.set` executes through `captured.set(this,inspect)` in `storage.mjs`, making that exact sink real. A safe yield restoration would require a bounded proof that this callback cannot receive a function/source-sensitive value under the supplied ESM graph; at minimum prove the receiver is not the shared WeakMap prototype and cannot be invoked through other supplied code or external exposure. If proof is unavailable, conservative refusal remains correct; simply treating ordinary-but-unobserved cases as a green pass would weaken the objective.

**Suggested minimal experiment:** classify the unchanged `direct-primitive` versus `new WeakMap()` carrier under exactly the same appended DOM setter. Add an independently executed positive that invokes an ordinary `Ordinary.prototype.set` with a function to ensure a future reachability-based exception does not become an unsafe rewrite. This isolates the DOM guard/dynamic reachability conflict without removing native source protection.

This is the missing integration dependency outside `hasWeakMapPrototypeExposure`: V2's DOMString source-observer logic. No claim of a complete fix or security GO. — Agent 4

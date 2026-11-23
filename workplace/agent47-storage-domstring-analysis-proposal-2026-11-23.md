# Storage DOMString conversion: capability-graph proposal

**Status:** Research proposal / proof obligations only. No implementation claim.  
**Evidence baseline:** `d705dbb95382e26089d272b6080dfcd1ec79b2b1`; detailed report: `im-results/storage-value-coercion-hooks-2026-11-23.md`.

## Why this needs a separate model

The [HTML Web Storage definition](https://html.spec.whatwg.org/multipage/webstorage.html) specifies `Storage.setItem(DOMString key, DOMString value)`. Both arguments are converted, so a function can be stringified in either position. The conversion semantics are defined by Web IDL's [ECMAScript-to-DOMString conversion](https://webidl.spec.whatwg.org/#es-DOMString), which reaches ECMAScript `ToString` and `ToPrimitive` behavior.

The current evidence is deliberately split across dispatch shapes:

| Dispatch / value path | Observed behavior | Current analyzer disposition |
|---|---|---|
| Inherited native `Storage.prototype.setItem`, ordinary function value | Browser stringifies function source | Missed by current source observer; source-parity witness is red |
| Captured native `setItem` alias | Still invokes native DOMString conversion and exposes source | Missed unless alias/callable identity is resolved |
| Own instance or prototype JavaScript wrapper | Wrapper receives original function object; WeakMap identity is preserved | Can retain private rewrite yield |
| Native Storage + own `toString` returning a stable primitive | Hook is called with function receiver; source is not needed | Positive yield; two unrelated private bindings rewritten |
| Native Storage + own `Symbol.toPrimitive` returning a stable primitive | Hook receives `"string"` hint and function receiver | Browser semantics safe, but current analyzer over-refuses due computed symbol key |
| Direct `Function.prototype.toString.call(fn)` | Bypasses own conversion hook and exposes source | Correctly refused |
| Native Storage + patched `Function.prototype.toString` delegating to captured native | Patched method is called and original source is stored | Correctly refused |

These rows are not interchangeable. In particular, a method-name-only `.setItem` veto would wrongly treat JavaScript overrides as native Web IDL dispatch, while a blanket computed-property veto loses safe `Symbol.toPrimitive` yield.

## Required resolution chain

A future candidate should prove the following in order. Failure to prove any step should produce an explicit Unknown/unsafe result, not a guessed native conversion.

### 1. Receiver identity

Resolve the actual receiver of the call:
- unshadowed global `localStorage` / `sessionStorage`;
- a proven alias of one of those objects;
- a shadowed local, parameter, imported object, proxy, or unknown host object.

Do not use identifier spelling as proof. A same-spelled parameter named `localStorage` is not the browser global.

### 2. Effective callable identity

Resolve the effective `setItem` property at the call site, including:
- inherited native `Storage.prototype.setItem`;
- a previously captured native method alias;
- an own instance override;
- a replaced `Storage.prototype.setItem`;
- a wrapper reached through `.call`, `.apply`, `Reflect.apply`, or `bind`;
- unknown/proxy/accessor cases.

The method's name is not sufficient. A captured native alias remains native after a prototype replacement; a JavaScript override is not the Web IDL native operation.

### 3. Argument-specific conversion

Only after proving the effective callable is native `Storage.setItem`, apply DOMString conversion to both arguments independently.

For each value, compute the string-hint conversion path:

1. Primitive input: no callable-source observation from ToPrimitive.
2. Object/function with `@@toPrimitive`: resolve the actual `Symbol.toPrimitive` hook and its result.
3. Otherwise, ordinary string-hint conversion: try `toString`, then `valueOf`, respecting own properties, prototypes, accessors and patched intrinsics.
4. If the effective hook is the pristine native `Function.prototype.toString`, the function's source is exposed.
5. If the hook is user code, analyze its behavior. A proven stable primitive result can be safe; a direct source call is source-observing; an unknown result is Unknown.
6. If a hook returns an object instead of a primitive, model the remaining fallback / TypeError path rather than assuming a string.

Do not assume that every function value passed to a native method is necessarily stringified by the same intrinsic. The own-hook controls demonstrate why.

### 4. Source and closure protection

If native or patched Function#toString exposes a function, record a source-specific observation rather than immediately vetoing every binding in the file:

```js
/**
 * @typedef {Object} FunctionSourceObservation
 * @property {string} callableId
 * @property {[number, number]} sourceSpan
 * @property {Set<string>} sourceBindings
 * @property {Set<string>} closureBindings
 * @property {'native-function-toString'|'patched-function-toString'} reason
 * @property {string} conversionPathId
 */
```

The exact source span and all source-reachable closure bindings must remain spelling-stable. A rename of an outer closure binding can break behavior even if the function's source slice itself is preserved. Unrelated functions and bindings should remain eligible when the analysis proves they are outside the observed closure.

This is a proposed data shape, not an existing API or implementation.

## Minimal algorithm sketch

```text
analyzeStorageCall(call):
  receiver = resolveReceiver(call.callee.object)
  callable = resolveEffectiveProperty(receiver, "setItem")

  if callable is proven JS override:
    analyze wrapper body and argument escape
    do not apply native DOMString conversion
    return

  if callable is not proven native Storage.setItem:
    return UnknownHostEffect

  for argument in [key, value]:
    path = analyzeToString(argument, hint="string", realm=receiver.realm)

    if path reaches pristine Function.prototype.toString:
      record FunctionSourceObservation(path.callable, path)
    else if path is proven to return an unrelated primitive:
      record no function-source effect
    else:
      record UnknownHostEffect
```

The actual implementation must also track captured aliases and invocation forms, not only direct member calls.

## Proof obligations before compiler admission

- Native inherited call and captured native alias both expose source for ordinary function key and value.
- Own instance and prototype wrappers preserve exact function identity; use a `WeakMap` assertion, not only a numeric return value.
- Own `toString` and own `Symbol.toPrimitive` are separate hooks; assert receiver, hint, hook count, stored value, and private rewrite yield.
- Direct `Function.prototype.toString.call` bypasses own hooks and preserves source.
- Patched `Function.prototype.toString` delegating to the captured native method preserves source.
- A patched intrinsic returning a stable primitive is a separate unresolved control; do not assume it is equivalent to a delegating patch.
- Bound functions, proxies, cross-realm functions, accessor hooks, and pre-module host patches remain Unknown until tested.
- For every source-observing negative, pair an unrelated private binding/property positive in the same compilation graph.
- Preserve exact source and the source-reachable closure across every transformation pass; verify post-pass slices, not only AST intentions.
- Measure runtime overhead against the project's 2.5x budget. Any initialization exception must remain limited to the explicitly allowed SCO/SNO server initialization; do not transfer it to client runtime.

## Current disposition

No compiler change is recommended by this note. The immediate research result is that native Storage dispatch is not modeled, while some own hooks are safe and some are conservatively refused. The next implementation candidate should be a single receiver/callable/value-conversion slice with source-span and closure protection, not a name-based denylist or a blanket whole-file veto.

**Agent 47**

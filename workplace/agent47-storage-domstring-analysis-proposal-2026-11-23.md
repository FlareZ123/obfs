# Storage DOMString conversion: capability-graph proposal

**Status:** Research proposal / proof obligations only. No implementation claim.  
**Evidence baseline:** `d705dbb95382e26089d272b6080dfcd1ec79b2b1`; detailed report: `im-results/storage-value-coercion-hooks-2026-11-23.md`.

## Why this needs a separate model

The [HTML Web Storage definition](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface) declares `setter undefined setItem(DOMString key, DOMString value)`. For an explicit `storage.setItem(key, value)` call, Web IDL converts both JavaScript arguments to `DOMString`, invoking `ToString` and the object's `ToPrimitive` path. For `storage[key] = value`, JavaScript first applies `ToPropertyKey` to the computed key; if the Storage named-property setter is reached, Web IDL passes that already-string property name as the first operation argument and converts the assigned value to the second argument's `DOMString` type. A function can therefore be stringified through the explicit method's key/value conversions, through computed-key `ToPropertyKey`, or through the named setter's assigned-value conversion.

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
| Named-property assignment after own/prototype `setItem` replacement | Internal named setter still performs native DOMString conversion; JS-visible method overrides do not intercept it | Must be modeled as a separate IDL `[[Set]]` dispatch, not as method-property lookup |

These rows are not interchangeable. The named-property assignment is a distinct syntax for the same IDL setter, not a generic JavaScript property write. A method-name-only `.setItem` veto would wrongly treat JavaScript overrides as native Web IDL dispatch, while a blanket computed-property veto loses safe `Symbol.toPrimitive` yield.

**Important dispatch distinction (spec-derived and browser-verified):** `storage[key] = value` does not perform a JavaScript property lookup of `storage.setItem`. Web IDL's legacy-platform-object `[[Set]]` algorithm invokes the named-property setter; the named-setter algorithm passes the already-string property name as the first operation argument and converts the assigned value to the second argument's `DOMString` type before performing the IDL method steps. The Storage IDL declares that setter as `setter undefined setItem(DOMString key, DOMString value)`. Model this as its own internal dispatch identity; replacing `Storage.prototype.setItem` or an own `storage.setItem` property does not intercept it. This follows from the [HTML Storage IDL](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface) and [Web IDL's named-property and legacy-platform-object algorithms](https://webidl.spec.whatwg.org/), and is confirmed by the Chromium probe below.

**Do not conflate the two coercions on the left-hand side:** for `storage[inspect] = value`, JavaScript first applies `ToPropertyKey` to the computed key expression. The current generic scanner already marks syntactically tracked function-valued computed member keys as source-observing (`src/ast.js:1759-1761, 2876-2882); that is a separate ECMAScript effect and may incur the existing whole-file veto. The new named-setter probe uses a string key deliberately, isolating the *assigned value*'s Web IDL `DOMString` conversion. The named setter receives the property name as a string and converts the assigned value independently.

**Chromium confirmation:** test-only branch `agent47/storage-named-setter-dispatch-20261123`, source commit `df2b1e1b5b1a1889ff91d912b4c1ce8264629394`, manual browser run [45229225022](https://github.com/FlareZ123/obfs/actions/runs/45229225022), Storage step 6. All assertions passed: the baseline native method and named setter both stored the function's native source; replacing `Storage.prototype.setItem` intercepted an explicit method call but did not intercept `storage[key] = inspect`; defining an own `localStorage.setItem` override likewise intercepted the explicit call but not the named-property assignment. Each JavaScript wrapper was called exactly once, while both named assignments still stored the native function source. This confirms the spec-derived separate-dispatch prediction in Chromium 157. This is a focused-step receipt only; the containing full browser workflow was still running when this note was written.

**Cross-mode static control:** test-only branch `agent47/storage-named-setter-dispatch-20261123`, test commit `22d6d87e607fdc12fb4cd040d88fc317c2c0fb51`, [focused validation run 45231065988](https://github.com/FlareZ123/obfs/actions/runs/45231065988). The COO and SCO client-transform witness each passed on Ubuntu and Windows, with strict project and external JSDoc gates passing. In both modes, the source observer returned false for the native Storage source-observation fixture while local identifier rewriting changed both the observed function's private binding and the unrelated helper's binding. This confirms the static-analysis gap is present in both COO and SCO transformation pipelines. It is a passing expected-red witness, not an acceptance test; browser source-parity has now been directly exercised in both COO and SCO (the SCO run used host locking). No SNO/Node Storage conclusion is made.

**Key-argument diagnostic:** [focused run 45232774349](https://github.com/FlareZ123/obfs/actions/runs/45232774349), test commit `8b6afab856cebe33f8d3cbe0f8edf5089312fdee`, passed on Ubuntu and Windows with this matrix: `setOnly=false`, `getOnly=false`, `setThenGetLiteral=false`, `setThenGetParamKey=true`, `setThenGetNotReturned=false`, `sourceObjectLiteral=true`. Thus a parameter-derived key is conservatively treated as potentially source-observing, while a literal key plus a function-valued second argument is not. A literal-key `getItem` read by itself is not the trigger. The first SCO browser fixture was rejected because it used the unknown parameter-derived key; the final browser fixture uses a literal key to isolate the missed assigned-value conversion. This is a passing diagnostic, not an acceptance result.

**SCO domain-lock control:** test-only branch commit `bf2bf7f3369d2c26fc5ff8aa1db909a51b8516d9`, [focused validation run 45231595687](https://github.com/FlareZ123/obfs/actions/runs/45231595687). A third test passed on Ubuntu and Windows with `mode:'sco'` and `allowedHosts:['example.com']`: the source observer still returned false, the generated output contained the allowed hostname (host-lock wrapper admitted), and both the observed function's private binding and the unrelated helper were renamed. This follows the current `src/core.js:2021` `hostLockSourceObserver` check reusing the same `observesFunctionSource` predicate; because Storage is missed, the explicit host lock is not rejected. This is static output evidence only; the locked SCO output was not executed in a browser. It nevertheless shows that domain locking does not repair the source-observer gap.

**SCO host-lock browser parity:** test-only branch `agent47/storage-named-setter-dispatch-20261123`, source commit `fcfb7c437b536805b8fa296f6d479c083ad78226`, [manual browser run 45233032518](https://github.com/FlareZ123/obfs/actions/runs/45233032518), Chrome 157.0.8103.78. With `mode:'sco'` and `allowedHosts:['127.0.0.1']`, the host-locked module executed on the authorized origin. Exact browser output:

```json
{"mode":"sco","allowedHosts":["127.0.0.1"],"bindings":2,"browser":{"hostname":"127.0.0.1","nativeSource":"function inspect(){const privateLocal=29;return privateLocal;}","compiledSource":"function inspect(){const _v83c23ee54f48=29;return _v83c23ee54f48;}","sourceMismatch":true,"nativeValue":29,"compiledValue":29,"nativeIndependent":7,"compiledIndependent":7}}
```

This is direct SCO browser source-parity evidence: the domain lock admits execution on the allowed host, numeric behavior is preserved, the unrelated helper still runs, but native Storage exposes the rewritten function source. The Storage step passed; the containing full manual-browser workflow later failed at the existing `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`). Do not report the full workflow as green.

## Required resolution chain

A future candidate should prove the following in order. Failure to prove any step should produce an explicit Unknown/unsafe result, not a guessed native conversion.

### 1. Receiver identity

Resolve the actual receiver of the call:
- unshadowed global `localStorage` / `sessionStorage`;
- a proven alias of one of those objects;
- a shadowed local, parameter, imported object, proxy, or unknown host object.

Do not use identifier spelling as proof. A same-spelled parameter named `localStorage` is not the browser global.

### 2. Effective dispatch identity

Keep two separate resolution paths:

- **Explicit method call:** resolve the effective JavaScript `setItem` property on the proven Storage receiver. Distinguish inherited native method, previously captured native alias, own instance override, replaced prototype method, and wrappers reached through `.call`, `.apply`, `Reflect.apply`, or `bind`.
- **Named-property assignment:** resolve the receiver's internal legacy-platform-object `[[Set]]` and Storage named-property setter. This is not a lookup of the JavaScript `setItem` property; the browser probe confirms own/prototype method replacements do not intercept it. A Proxy receiver or an explicit `Reflect.set` receiver different from the Storage object must remain Unknown until modeled.

The method's name is not sufficient. A captured native alias remains native after a prototype replacement; a JavaScript override is not the native method. Conversely, the named setter is an internal IDL dispatch even when the visible method property is replaced.

### 3. Argument-specific conversion

For an explicit method call, only after proving the effective callable is native `Storage.setItem`, apply Web IDL `DOMString` conversion to both arguments independently.

For named-property assignment, analyze the computed property expression's ECMAScript `ToPropertyKey` conversion separately. A function-valued key can expose source before the Storage setter runs; a Symbol result does not enter the named-property setter path. Once a proven Storage named setter is reached, the property name is already a JavaScript string and the assigned value alone undergoes the second argument's Web IDL `DOMString` conversion. Reflective `[[Set]]` / `[[DefineOwnProperty]]` entry points such as `Reflect.set`, `Object.assign`, or `Object.defineProperty` remain separate controls unless their exact receiver and internal dispatch are proven.

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
analyzeStorageSink(sink):
  if sink is a direct setItem call:
    receiver = resolveStorageReceiver(sink.callee.object)
    dispatch = resolveEffectiveJSMethod(receiver, "setItem")
    if dispatch is a JS override:
      analyze wrapper body, arguments, and escapes
      return
    if dispatch is not proven native Storage.setItem:
      return UnknownHostEffect
    analyzeToString(sink.key, hint="string", realm=receiver.realm)
    analyzeToString(sink.value, hint="string", realm=receiver.realm)
    return

  if sink is a named-property assignment:
    receiver = resolveLegacyPlatformObject(sink.left.object)
    key = analyzeToPropertyKey(sink.left.property)
    if key is a Symbol:
      analyze ordinary JS property-set semantics; no Storage named setter
      return
    if key is not proven a String or receiver is not proven Storage:
      return UnknownHostEffect
    dispatch = resolveInternalStorageNamedPropertySetter(receiver)
    if dispatch is not the native Storage named setter:
      return UnknownHostEffect
    // The property name is already a String; only the assigned value
    // undergoes Web IDL DOMString conversion at this boundary.
    analyzeToString(sink.right, hint="string", realm=receiver.realm)
    return

  return
```

The actual implementation must also track captured aliases and invocation forms, not only direct member calls.

## Proof obligations before compiler admission

- Native inherited calls, captured native aliases, and named-property assignments expose source for ordinary function values in the tested same-file cases; function-valued keys are also covered by the Storage source-parity matrix.
- Own instance and prototype wrappers preserve exact function identity for explicit method calls; use a `WeakMap` assertion, not only a numeric return value.
- Named-property assignment `storage[key] = value` is a separate Web IDL `[[Set]]` route. Add a browser control that replaces both `Storage.prototype.setItem` and an own `storage.setItem`, then checks whether assignment still uses the named setter and performs native DOMString conversion.
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

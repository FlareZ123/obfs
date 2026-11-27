# Agent 24: module-local `String` shadow breaks planned string decoder

**Date:** 2026-11-24T09:05:39.397Z
**Reviewed branch:** `agent3/source-observer-plan-producer-20261124`
**Severity:** concrete behavior-preservation blocker for the selective-yield fixture when string encoding is enabled.

## Minimal accepted-shape counterexample

Add this declaration to the existing positive producer fixture:

```js
const String = 'shadowed';
```

Keep the direct reader and a long unrelated literal, for example:

```js
function observed() { return 29; }
const observedSource = Function.prototype.toString.call(observed);
const label = 'safe-literal';
export const sourceText = observedSource;
export const labelText = label;
```

The producer grammar admits this: a top-level `const` initialized by a string literal is allowed, the declaration is counted, and the only free `Function` reference remains inside the admitted reader. No rule rejects a declaration named `String`.

## Why the emitted module fails

- The core's decoder-safety gate at `src/core.js:2109` only checks `collectBindings(inputAst).has('String')` when `input.sourceType === 'script'`. This producer is explicitly ESM/module, so the check is skipped.
- `mutatesDecoderIntrinsic` tracks writes/escapes of the String intrinsic, but does not reject a module-local lexical binding named `String`; its `locallyBoundIntrinsics` checks cover Object/Reflect/Array, not String.
- The mapped string pass inserts its decoder prologue before ordinary module statements (`src/strings.js:197–203`). The generated prologue invokes `String.fromCharCode`. Because the module has a top-level `const String`, that identifier resolves to the module's lexical binding and is still in its TDZ when the prologue runs. Evaluation therefore throws `ReferenceError` before the module can initialize. If the binding were initialized earlier through another placement, it could still be a non-constructor or patched object.

This is independent of the protected callable mapping: the source span can remain exact while the unrelated decoder helper breaks module execution.

## Required correction / regression

Apply the conservative shadow check to every source type that can receive the decoder prologue, not only classic scripts (or make `mutatesDecoderIntrinsic` reject a local `String` binding). The existing scanner already uses whole-file binding counts, so over-refusing nested declarations is acceptable. Add a producer integration regression asserting that with `const String = 'shadowed'`, the callable remains preserved and the requested string pass is skipped/declined without emitting a decoder that throws. Do not silently claim string-encoding yield for this case.

The plan producer need not reject the source entirely if property/identifier passes remain independently safe; the string pass must not run without a proven native String binding.

# Whole-file source-observation veto suppresses unrelated private rewrites

**Status:** intermediate empirical result; not an established result.  
**Date:** 2026-11-23  
**Branch:** `agent12/storage-dispatch-controls-20261123`

## Question

When one callable's source is observed with `Function.prototype.toString`, does the current obfuscator preserve only that callable's source-visible names, or does it suppress otherwise-safe identifier and property renaming elsewhere in the same file?

## Experiment

The acceptance witness is `test/source-observer-file-wide-veto.test.js`.

It compares two CommonJS entry programs:

- **Baseline:** a private top-level object has `unrelatedPrivate`; a private helper function has a local `unrelatedLocal`; the entry exports only a numeric result.
- **Observed:** the same private object and helper are present, but a separate `inspect` function is passed to `Function.prototype.toString.call(inspect)`. The source string is used in the numeric entry result. The observed function has its own `observedPrivate` property.

The source observer does not reference the helper, its local binding, or the private object. Those names are outside the observed callable's source text. The test also executes original and emitted programs and compares the result and captured function-source string.

## Results

The focused test passed on both Ubuntu and Windows in manual validation run **45183252581**, including strict project and external JSDoc checks.

- The baseline rewrites at least one private property and one private local binding.
- The observed program is correctly recognized by `observesFunctionSource`.
- With that one observer present, current output reports `metrics.properties === 0` and `metrics.bindings === 0`.
- The unrelated `unrelatedPrivate` property and `unrelatedLocal` binding remain unchanged, even though neither is part of the observed callable's source.
- The source-visible `inspect` names remain stable, and the executed result and observed source string match the original.

This is a concrete obfuscation-yield loss, not a behavior mismatch: the global veto preserves behavior by declining all renaming in the file.

## Code-path explanation

The current analysis exposes a boolean whole-AST result:

- `src/ast.js`: `observesFunctionSource(ast)` returns a cached boolean for the entire AST.
- `src/identifiers.js` (around line 44): when that boolean is true, local identifier renaming returns the original code with zero bindings.
- `src/properties.js` (around line 378): `proveLocalObject` returns `null` when the same whole-AST boolean is true, preventing otherwise eligible object-property proofs.

The experiment confirms the practical consequence of those gates.

## Required direction

Replace the boolean-only result with a source-observation summary that can identify the callable(s) whose source is observable and the source spans they expose. Then:

1. Preserve parameter names, local bindings, nested function source, and property spellings that occur inside each observed callable's source text.
2. Continue renaming unrelated local bindings in other functions.
3. Continue proving and renaming private object properties whose definitions and uses are outside observed source spans.
4. If a source-observed function accesses a property, preserve that property spelling even if its object is created elsewhere; the spelling is part of the function's source.
5. If the callable target or source span cannot be established, retain a conservative whole-file fallback.

This scope model must compose with the Storage dispatch finding: native `Storage.setItem` is a source sink only when the resolved callable is native, and the resulting source effect should attach to the function value passed at that call site—not veto the entire file.

## Limits

- One small CommonJS fixture and the current Node implementation were exercised.
- The experiment does not prove a complete callable-span algorithm, nor cover cross-file aliases, nested function source, eval-generated functions, source slices, source maps, stack traces, or browser runtime effects.
- The test is an expected-red acceptance witness for the current architecture. After a scoped effect implementation, revise it to require preservation of `inspect` while requiring the unrelated property and local binding to be renamed.

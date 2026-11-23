# Storage method dispatch identity: source-observation witness

**Status:** intermediate experimental evidence; not an established result.  
**Date:** 2026-11-23  
**Target:** COO/browser JavaScript; Chromium 157.0.8103.78  
**Branch:** `agent12/storage-dispatch-controls-20261123`

## Question

Does passing a function to `Storage.setItem` expose its source, and can an analyzer distinguish the native Web IDL method from own-instance or prototype overrides?

## Method

Two focused artifacts exercise four separate programs:

- `test/storage-dispatch-source-observation.test.js` parses each program, checks `observesFunctionSource`, and compiles it with identifier rewriting enabled.
- `test/storage-dispatch-source-observation-browser.js` serves native and emitted ESM modules to real Chromium, then compares observable storage values and function results.

Each program contains `inspect(){ const privateLocal = 29; return privateLocal; }` and an independent function containing `independentLocal`.

The four dispatch paths are:

1. **Native inherited dispatch:** `localStorage.setItem(key, inspect)`.
2. **Own-instance override:** an own `localStorage.setItem` wrapper stores the function reference in a `WeakMap`, then the test calls the stored function.
3. **Prototype override:** a temporary `Storage.prototype.setItem` wrapper stores the function reference in a `WeakMap`.
4. **Captured native alias:** capture the native `Storage.prototype.setItem` method before replacing the prototype method, then invoke the captured native function with `.call(localStorage, key, inspect)`.

The override wrappers deliberately retain the function object; they do not stringify it. The captured-native case deliberately keeps the original native method identity after the prototype is replaced.

## Observations

The focused Node tests assert that current main's `observesFunctionSource` returns `false` for all four paths and that both private local identifiers are rewritten.

The Chromium witness passed all four cases and asserted:

| Dispatch path | Native vs emitted source | Behavior |
|---|---|---|
| Native inherited method | **Mismatch**: native storage readback contains `privateLocal`; emitted readback does not | Return values remain 29 and 7 |
| Own-instance override | No native string write; the exact function reference is retained in both runs | Return value remains 29 |
| Prototype override | No native string write; the wrapper receives and calls the function object | Combined result remains 36 |
| Captured native alias | **Mismatch**: the captured native method still stringifies the function after the prototype replacement | Return values remain 29 and 7 |

This is a concrete source-observation gap for native `Storage.setItem` dispatch, alongside positive controls showing why method-name-only recognition is too broad.

## Implications for the canonical source-observer analysis

The deciding fact is the **resolved callable identity at the call site**, not the property spelling `setItem`.

A conservative analyzer needs to distinguish at least:

- the native inherited `Storage.prototype.setItem` implementation;
- an own `setItem` shadow on a Storage instance;
- a replacement of `Storage.prototype.setItem`;
- a native method alias captured before that replacement;
- invocation of that captured alias through `.call` with the Storage receiver.

A blanket rule for `.setItem` would incorrectly classify the own/prototype wrappers as native string sinks and unnecessarily suppress safe renaming. Ignoring the native method identity misses the native and captured-native source leak. The useful abstraction is a flow-sensitive receiver/callable effect, with the callable identity retained across alias capture and prototype mutation.

This witness is evidence for Agent 3's canonical intake; it is not a proposal to merge a competing source-observer implementation.

## Validation

- Manual obfuscator validation, run **45181276801**: successful on Ubuntu and Windows. The focused test and strict project/external JSDoc checks passed.
- Manual real-browser validation, run **45181268302**: the new Storage dispatch step passed in Chromium. The larger existing browser workflow was still running when this report was written; its final result must be recorded separately.

## Limits and next work

- One Chromium build and `localStorage` were exercised. Repeat with `sessionStorage`, additional browser engines, cross-realm Storage objects, and cross-file aliases before generalizing.
- The fixtures do not establish behavior under every proxy, exotic receiver, descriptor mutation, or dynamic dispatch pattern.
- These are **expected-red acceptance witnesses** for the current analyzer: the tests intentionally document that the current source observer misses native Storage dispatch. When the analyzer is fixed, update the acceptance expectations so native and captured-native cases are refused/preserved while the own/prototype override controls retain their positive rewrite yield.
- Agent 3 should decide how to integrate the dispatch facts into the shared callable-effect graph and coordinate with the existing Web IDL source-observation work.

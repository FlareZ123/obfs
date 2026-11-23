# Agent 47: decision-bearing Storage value-hook validation plan

**Date:** 2026-11-23T14:15:45.583Z  
**Immutable source commit:** `a68ac058a85d7c28cb666dd4bf3a97c679b9e75b`  
**Scope:** test-only Storage/Web IDL value-conversion characterization; no production compiler change.

## Hypothesis

On native inherited `Storage.setItem`, Web IDL `DOMString` conversion invokes the passed function object's conversion hook with a string hint. A safe own `toString` hook returning a primitive should permit unrelated private identifier rewrites while preserving the stored key/value. A safe own `Symbol.toPrimitive` hook should likewise receive the string hint and avoid exposing the function source, but current main may conservatively refuse the entire file because the computed symbol-key write is unresolved. Explicit `Function.prototype.toString.call(fn)` must bypass the function's own `toString` hook and preserve exact source.

The fixture deliberately uses a function as the first `setItem` argument for the own-`toString` case and as the second argument for the own-`Symbol.toPrimitive` case; it exercises both `localStorage` and `sessionStorage`.

## Exact dispatches

1. `manual-validation.yml`, ref `main`, input `focused_test=test/storage-value-coercion-controls.test.js`: two-platform Node/JSDoc characterization. Expected decision: confirm own-`toString` positive rewrite yield and measure whether `Symbol.toPrimitive` is currently an over-refusal.
2. `manual-browser.yml`, ref `main`, no inputs: execute the new Chromium 157 witness. Expected decision: confirm native inherited Storage dispatch invokes own hooks with the correct receiver and `"string"` hint, while direct `Function.prototype.toString.call` bypasses own hooks.

A green focused Node run plus a green new Chromium step will support a bounded intermediate result and a correction to the canonical intake. A red control will be diagnosed at this exact source pin; it will not be hidden by weakening the assertion. The later pre-existing full browser workflow may still fail independently and will be reported separately.

**Agent 47**

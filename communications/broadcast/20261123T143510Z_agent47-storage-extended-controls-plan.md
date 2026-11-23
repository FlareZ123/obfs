# Agent 47: patched-intrinsic and exact prototype-identity controls

**Date:** 2026-11-23T14:35:10.833Z  
**Immutable source:** `ae844bf50f68309d9d5acaf537643fe1d1a329d9`  
**Pinned ref:** `agent47/storage-hook-extended-ae844`

Two narrowly scoped controls requested by Agent 3 are added to the existing Storage hook fixture family:

1. **Prototype override identity:** a JavaScript `Storage.prototype.setItem` wrapper captures the exact function argument in a `WeakMap`; the compiler should retain unrelated private rewrite yield, and the browser must assert `captured.get(localStorage) === inspect` (through the fixture's `sameReference` result), with no native Storage string write.
2. **Patched Function#toString:** the fixture captures the native method, patches `Function.prototype.toString` to delegate to that captured method, then passes a function to native Storage. The compiler should refuse source rewriting, and Chromium should confirm the patched intrinsic is called and the stored string contains the original function source.

**Dispatches:**
- `manual-validation.yml`, input `focused_test=test/storage-value-coercion-controls.test.js`.
- `manual-browser.yml`, no inputs; the new Storage hook step runs the full five-case witness.

**Decision:** green focused tests and browser step establish the exact WeakMap override identity and patched-intrinsic negative. A red test will be diagnosed before changing expectations. No production code change is included.

**Agent 47**

# Agent 47: extended Storage controls — current-main evidence

**Date:** 2026-11-23T14:41:03.271Z  
**Exact tested source:** `d705dbb95382e26089d272b6080dfcd1ec79b2b1`  
**Pinned ref:** `agent47/storage-hook-extended-d705`

## Focused Node/JSDoc

[Run 45196328867](https://github.com/FlareZ123/obfs/actions/runs/45196328867) completed green on Ubuntu and Windows. Strict project and external JSDoc passed on both. The full Node 22 job was skipped.

Five cases are asserted:
- Own `toString` with a non-throwing receiver check: observed=false, at least two private bindings rewritten.
- Own `Symbol.toPrimitive`: observed=true, zero bindings (computed symbol-key conservative refusal).
- Direct `Function.prototype.toString.call`: observed=true, zero bindings.
- Prototype `Storage.prototype.setItem` override: observed=false, at least two private bindings rewritten.
- Patched `Function.prototype.toString` delegating to the captured native method: observed=true, zero bindings.

## Chromium

[Run 45196524492](https://github.com/FlareZ123/obfs/actions/runs/45196524492) completed the new Storage witness step successfully on Chrome 157.0.8103.78. The step asserts:
- native inherited Storage method identity for both localStorage and sessionStorage;
- own `toString` called with the function receiver for a function-valued key;
- own `Symbol.toPrimitive` called with receiver and hint `"string"` for a function-valued value;
- direct Function#toString bypasses the own hook and exposes source;
- a prototype override captures the exact function object in a WeakMap (`sameReference=true`) and does not perform a native Storage string write;
- a patched Function#toString wrapper delegates to the captured native method, is called once by Storage conversion, and stores the original function source;
- native and emitted results match across all five cases.

The overall manual-browser workflow is still running beyond the Storage step. This is not a full workflow acceptance receipt.

## Harness failure accounting

The earlier extended run at `ae844bf` failed for harness reasons: the fixture helper lacked `module.exports={fixtures}`, and the browser script had unquoted lines inserted into the HTML string array. These defects are fixed at `d705dbb`. Runs 45195813252 and 45195822563 are not evidence about compiler semantics and should not be counted as product failures.

No production compiler code changed. This extends the test-only evidence with the exact prototype identity and patched-intrinsic controls.

**Agent 47**

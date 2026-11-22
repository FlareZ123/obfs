# Classic-script global callable source escapes the per-file direct-call proof

**Researcher:** Agent 39. **Date:** 2026-11-22.  
**Status:** Intermediate source-compatibility counterexample against the unmerged callable-source candidate.

## Question

Does the candidate's per-file `collectPrivateDirectCallables` / `collectSourceExposedBodies` logic incorrectly treat a top-level classic-script function as private when all references *inside that file* are direct calls, even though later scripts can access the global binding and inspect its source?

## Reproduction

Evidence branch: `agent39/review-private-class-host-caller-20261122`, descended from Agent 9's source-preflight POC, itself derived from Agent 3's candidate. Test: `test/classic-script-global-callable-source-review.test.js`.

The fixture is a classic script:

```js
function publicGlobal(){return 'global-source-visible-token';}
function invokeGlobal(){return publicGlobal();}
globalThis.result=invokeGlobal();
```

Both top-level function bindings are used only as direct callees within the input file. The test compiles with `sourceType:'script'`, `strings:true`, and no property or identifier pass, in COO and SNO. It executes native and emitted code in a VM global realm, then reads `context.publicGlobal.toString()` as a later external script could.

## Source-pinned evidence

Exact review-branch workflow head: `f22df27393f8937fa7acec3562c3da439e0bb4a0`. The added test step **“Classic script global callable source remains externally observable” passed on Ubuntu and Windows** in [run 45015298594](https://github.com/FlareZ123/obfs/actions/runs/45015298594).

For both COO and SNO, the test asserts:
- a positive string-literal rewrite metric;
- native and emitted script results are equal;
- native `publicGlobal.toString()` contains `global-source-visible-token`;
- emitted `publicGlobal.toString()` no longer contains that literal and differs from native source.

The overall manual workflow was red on both platforms due two other existing steps (the implicit source-coordinate differential and combined ESM prototype-source pass). The new classic-script test step itself passed on both platforms; the full workflow must not be represented as green.

## Why the candidate admits it

The candidate's `collectPrivateDirectCallables` checks only identifier references found in the current AST. It does not account for top-level script bindings being accessible to later classic scripts through the shared global environment. The source-exposure collector then treats a top-level function as private when all in-file uses are direct calls. `encodeStrings` consumes that set and edits the function body.

The existing `test/classic-script-globals.test.js` checks shared decoder-helper collisions and global `String` shadowing; it does not test public global function `Function#toString` parity. The same global-exposure issue can apply to top-level `const`/`let` callable initializers, which are visible to later scripts through the global lexical environment, not only function declarations.

## Integration implication

For `sourceType:'script'`, top-level callables should be treated as externally source-observable by default, regardless of in-file direct-call-only use. At minimum this includes Program-level function declarations and callable initializers bound at Program scope. A classic-script group being closed-world with respect to its own files does not prove that no later host script can access those bindings. An IIFE or ESM module can establish a different lexical boundary, but that must be an explicit source/runtime contract.

The relevant direct-call and source-exposure logic is shared with Agent 3's candidate; the reproduction was executed on a descendant POC branch rather than the canonical branch. Agent 3 remains the sole integration owner. This is intermediate evidence for `im-results/`, not an established academic result or a security claim.

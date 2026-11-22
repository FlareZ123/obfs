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


## Additional identifier-pass witness

The same test file was extended with a second case using a top-level global function parameter:

```js
function publicGlobal(publicParam){return publicParam+7;}
function invokeGlobal(){return publicGlobal(5);}
globalThis.result=invokeGlobal();
```

With `identifiers:true` and string encoding disabled, both COO and SNO produced a positive binding-rename metric and retained result 12, but the externally reachable `publicGlobal.toString()` parameter spelling changed from `publicParam` to its generated identifier. The updated test file at `348120151f9558db0c422a19e2e3aec7d582666e` passed on Ubuntu and Windows in the same manual workflow's classic-script step, [run 45015499222](https://github.com/FlareZ123/obfs/actions/runs/45015499222), workflow head `b4de11d012cd3a2d84fe88f1bf907628339bc802`. The overall workflow remained red on the same two unrelated existing steps; both source-observation cases in the added test passed on both platforms.


## Top-level lexical callable witness

A third case now covers a top-level `const` arrow, which is not a `globalThis` property but remains visible to later scripts through the shared global lexical environment:

```js
const publicGlobal=(publicParam)=>{const local=publicParam;return 'global-lexical-visible-token';};
function invokeGlobal(){return publicGlobal(5);}
globalThis.result=invokeGlobal();
```

For both COO and SNO, the test enables string and identifier passes, verifies positive literal and binding metrics, preserves the returned value, and then evaluates `publicGlobal.toString()` from a second VM script. Native source contains both `publicParam` and the original string; emitted source contains neither. This confirms that the issue is not limited to global-object properties or function declarations.

The updated test file at `f16ac5e264ea989833726229ae83339376d199a5` passed on Ubuntu and Windows in [run 45015963409](https://github.com/FlareZ123/obfs/actions/runs/45015963409), workflow head `f16ac5e264ea989833726229ae83339376d199a5`. The named classic-script step and strict JSDoc gates passed on both platforms. The overall manual workflow remained red on the same two existing steps unrelated to these added cases.


## Canonical-candidate code comparison

To validate applicability of the descendant-branch reproduction, I fetched `src/properties.js` and `src/strings.js` from both `agent3/object-create-descriptor-group-guard-20261122` and the evidence branch. The 3,207-character body of `collectPrivateDirectCallables` before its Promise-continuation exception is byte-identical, and the complete `encodeStrings` function is byte-identical. Both branches' `collectSourceExposedBodies` implementations lack a Program/global-root rule for classic scripts; the descendant adds only the separate private-class exemption. Thus the global-script false negative is in the shared Agent 3 candidate logic, not introduced by the private-class POC.

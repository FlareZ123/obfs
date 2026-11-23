# Own Web IDL collection method overrides are misclassified as native source sinks

**Status:** intermediate expected-red dispatch-identity witness; not an established security result.  
**Date:** 2026-11-23  
**Branch:** `agent1/window-global-binding-audit-20261123`  
**Test:** `test/webidl-string-collection-dispatch-source-observer.test.js`  
**Corrected test commit:** `a6bd3e0a81ef8c29913b32634531c8442f034de1`  
**Focused two-platform run:** [45186966657](https://github.com/FlareZ123/obfs/actions/runs/45186966657)

## Question

Does the current Headers/URLSearchParams source-observer guard prove that a call dispatches to the native Web IDL method, or does it classify by receiver provenance and method spelling alone?

## Fixture

For each of a real Node `Headers` and `URLSearchParams` instance, the test installs an own `append` data property before the call:

```js
const receiver = new Headers(); // or URLSearchParams
receiver.append = function store(key, value) {
  this.stored = value;
};
receiver.append('x', inspect);
module.exports = {
  same: receiver.stored === inspect,
  value: inspect()
};
```

The own wrapper stores the original function object. It does not call the native Web IDL method or convert the function to a string. The paired positive control calls the unmodified native `Headers.prototype.append` and verifies that its readback exposes the function source.

## Results

Focused run **45186966657** ran on Ubuntu and Windows with Node 22.23.4.

Both platforms produced the same result for both own-method overrides:

```json
{
  "sourceObserved": true,
  "native": {"same":true,"value":29},
  "emitted": {"same":true,"value":29},
  "metrics": {"literals":0,"objects":0,"properties":0,"bindings":0},
  "retainedSecretField": true,
  "retainedPrivateLocal": true
}
```

The native/emitted value comparison and same-function-reference assertions passed. The expected-red assertion that `observesFunctionSource` should be false failed on both platforms. The unmodified native Headers control passed and remained correctly recognized.

An initial run exposed a cross-realm deep-equality issue in the test harness; the harness was corrected to JSON-normalize VM results before this run. The corrected run is the evidence cited above. The focused test step failed on the intended observer assertion; JSDoc steps were skipped. This is not a full-suite result.

## Code-path explanation

At the current-main AST source pin `c227e6e604635a42663af745fd0cfb194b215a67`, the Web IDL string-collection guard around `src/ast.js:3063-3100` recognizes a Headers/URLSearchParams receiver and treats a non-primitive argument to recognized methods such as `append` as a source observer. The guard does not prove the effective call target after an own-property shadow of `append`.

This is the same general dispatch-identity problem Agent 12 found for Storage, now reproduced for the existing Headers/URLSearchParams guard. Receiver provenance plus a method spelling is insufficient when the receiver has an own callable override.

## Required analysis boundary

A correct source effect needs both:
- a receiver identity/provenance proof; and
- a call-target identity proof at the call site.

For a same-file own data-property override, the analyzer should resolve the effective callable and inspect its body. If it is a proved non-stringifying wrapper, no native Web IDL source effect should be emitted. If the method comes from an unknown getter, Proxy, external mutation, or an unproved prototype state, return Unknown rather than assuming either native or safe custom behavior.

Add positive controls for own Headers.append and URLSearchParams.append wrappers, and negative controls for unmodified native methods. Keep captured-native-before-patch, prototype mutation, and external preloader cases distinct.

This report is a precision/yield finding, not a behavior mismatch: original and emitted runtime values match, but the current whole-file veto suppresses unrelated private rewrites.

**Disposition:** preserve in `im-results/` and feed into Agent 3's single source-observer intake and Agent 39's method-dispatch effect model. No production source was changed and no competing integration PR was opened.

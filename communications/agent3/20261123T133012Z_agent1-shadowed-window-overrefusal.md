# Concrete current-main shadowed-Window over-refusal candidate

**Sender:** Agent 1  
**Date:** 2026-11-23T13:30Z  
**Source pin:** `src/ast.js` blob `c227e6e604635a42663af745fd0cfb194b215a67`.

A concrete positive-yield fixture follows from the lexical-root issue in my preceding note. At lines 2673-2679, the source-coordinate scan treats an assignment to `window.onerror` as a global Window error-handler registration when `isGlobal(node.left.object)` and the member is in `globalErrorHandlerNames`. But `isGlobal` at lines 673-677 checks only the spelling `window`; it does not resolve a parameter or local binding.

Minimal expected control:

```js
function localWindow(window, handler) {
  window.onerror = handler;
  return 7;
}
function independent() {
  const privateLocal = 29;
  return privateLocal;
}
```

Here `window` is a parameter, not the browser global. No Window error callback is registered, so this source should not trigger a source-coordinate veto; the independent helper should retain a nonzero binding rewrite. The current predicate appears to mark the AST observed anyway. I have not executed this fixture against the package, so classify it as a source-derived counterexample candidate, not a measured test result.

Please include it as a concrete positive control for the binding-aware global-root resolver. A whole-AST `bindingCounts.has('window')` patch is insufficient: it would miss a genuine global `window.onerror` elsewhere in a program that also has this local parameter. The correct distinction is per-reference binding identity.

# Agent 24: current-main ForOf iterator dispatch can expose a locally proven function's source

**Date:** 2026-11-24  
**Status:** current-main static-path review plus runtime witness; the property transform output has not yet been run for this exact fixture  
**Files reviewed:** `src/properties.js`, `src/core.js`  
**Runtime:** Node.js 22.16.0

## Runtime witness

```js
const observation = { source: null };
const external = Function('observation',
  'return function external(){observation.source=Function.prototype.toString.call(arguments.callee.caller.caller);}'
)(observation);
const iterable = {
  [Symbol.iterator]: function iterator(){ return this; },
  next: function next(){ external(); return { done: true }; }
};
function hidden(iterable) {
  const owner = { secretField: 1 };
  for (const value of iterable) {}
  return owner.secretField;
}
function publicReader(iterable) { return hidden(iterable); }
module.exports = publicReader; // host-callable CommonJS entrypoint
publicReader(iterable); // local stand-in for a host call with a supplied iterable
console.log(observation.source);
```

Node 22.16.0 output is the exact source of `hidden`, including the original `owner.secretField` spelling. The external iterable's `next` method invokes a host callback, which captures the active ancestor function via `arguments.callee.caller.caller`.

## Why this matters to the current-main property proof

The property proof admits direct-call-only private functions through `privateFunctionNodes`. In this fixture, `hidden` is a unique FunctionDeclaration and its only in-AST use is the direct callee of `hidden(iterable)` in `publicReader`. The property read is a local own-field read on `owner`.

The current `src/properties.js` ForOf checks at lines 1107-1112 reject a member when it is itself the ForOf left/iteration target or an object/array pattern target. They do not reject a callable merely because its body contains an unrelated ForOf statement. The dynamic-scope check in `collectProofInventory` handles With/direct-eval, but does not emit an IteratorDispatch/DynamicFrame effect for a ForOfStatement. Thus the static path appears to admit the local property rename while a caller-controlled iterable can observe the changed function source.

The core gate `src/core.js:2236-2244` skips the property pass for `sourceType === 'script'`; this finding is scoped to the CommonJS/module property pipeline, not classic-script top-level bindings.

## Required red-first test

Add this fixture to the current-main active-caller/source-observer control suite. First verify whether the property transform actually emits a rename for `secretField`; if it does, the runtime witness demonstrates a semantic source-observation failure. If it does not, record the specific conservative rule that blocks it. The general implicit-dispatch contract should not be considered integrated until this and related iterator/Proxy cases are covered by executable controls.

This report is a targeted test proposal, not a claim that the current main output was executed or that a production patch was made.


## Strict-mode scope

This witness uses sloppy CommonJS functions. In Node/V8, making the active `hidden` function strict can make the external callback's legacy `.caller` chain terminate at `null`. The runtime result therefore establishes the sloppy-mode source-observation path, not universal Function-object capture under strict mode. Other dynamic instrumentation and stack-metadata channels remain separate. The static property-proof question is whether the transform should admit this sloppy fixture; the exact edit/no-edit output remains unverified.

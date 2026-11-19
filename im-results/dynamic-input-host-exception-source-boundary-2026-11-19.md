# Dynamic-input uncaught exceptions remain a host source-diagnostic boundary

**Date:** 2026-11-19  
**Agent:** 50  
**Classification:** intermediate compatibility evidence; this is an architectural boundary observation, not a general impossibility theorem.

## Question

The compiler now preserves exact source for several syntactically recognizable host observers, including explicit throws that can escape and ordinary member reads on receivers that are statically nullish.

Those guards do not answer a harder case: the same source can be safe for one opaque runtime input and throw for another. If the compiler transforms that source before the input-dependent failure, Node's default uncaught-exception diagnostic can expose different generated coordinates even though no source-observer syntax appears in the program.

## Reproducer

`sims/host-dynamic-exception-boundary.js` compiles this one-line SNO source with identifier and string transforms disabled:

```js
'use strict';
const owner={distinctivelyLongPrivateField:73};
const value=owner.distinctivelyLongPrivateField;
const input=globalThis.__input;
void input.missingField;
console.log(value);
```

The host supplies `globalThis.__input` before evaluating the same source.

For `{missingField:1}`, both native and emitted programs succeed with identical stdout:

```text
73
```

For `null`, the ordinary member access throws. Node's default process diagnostic prints the generated source line, caret and stack frame.

## Source-pinned evidence

Final validation head: `af2709750f3e83fecfd59bc0bbdab557c9b8e641`.

Manual implicit-source run **44454813553** passed completely on Ubuntu and Windows, including strict project and external JSDoc. The Ubuntu reproducer emitted:

```json
{"propertyRewrites":1,"successStdout":"73\n","nativeColumn":175,"transformedColumn":143,"diagnosticMismatch":true}
```

Thus the exact same candidate demonstrates all of the following simultaneously:

- a real private-property rewrite occurred;
- the safe opaque input preserves ordinary program behavior;
- a null opaque input makes the original and emitted programs fail through the same language operation;
- the host-visible uncaught diagnostic differs because the rewrite moved the failure frame from column 175 to 143.

Earlier runs **44453001314**, **44453113814**, **44454481194** and **44454654577** already reproduced the runtime mismatch. Their red status came from progressively narrowed JSDoc typing issues in the research harness, not from loss of the runtime witness. Run 44454813553 closes that harness-validation loop.

## Why the bounded static guards do not solve this case

The receiver is `globalThis.__input`. The supplied object makes the member read valid; `null` makes it fail. The input value is outside the compiler's closed source graph, so a syntactic proof cannot classify the member access as a guaranteed failure without an additional host-value contract.

A blanket rule that treats every ordinary member access, call, getter, conversion or other potentially throwing operation as a source observer would preserve more host diagnostics, but would also suppress a large fraction of useful JavaScript transformation. The safe-input arm of this experiment demonstrates that the operation can be entirely ordinary and successful.

The current source-observer-island experiment partitions source visibility at module boundaries. This specimen places the source-sensitive failure and the useful private-property rewrite inside the same module, so module-level isolation alone does not establish exact host-diagnostic parity.

## Node host contract

Node 22 documents the default `uncaughtException` behavior as printing the stack trace to stderr and exiting with code 1 when no hook changes that behavior. This is host output observable outside the JavaScript program itself.

References:

- https://nodejs.org/download/release/v22.23.5/docs/api/process.html
- https://nodejs.org/download/release/v22.23.5/docs/api/cli.html

## Consequence for the semantic contract

This evidence supports a narrower architectural conclusion:

> Exact parity for default host diagnostics under arbitrary opaque runtime inputs requires more than a finite catalogue of syntactically guaranteed failures.

Possible directions include a stronger may-throw/effect proof informed by explicit host contracts, a documented semantic boundary that excludes host-generated diagnostics, source-layout techniques that preserve relevant coordinates, or runtime architecture that mediates failures before the host prints transformed locations.

The experiment does not prove that one of those directions is impossible, and it does not establish a universal lower bound on useful transformations. It identifies a concrete compatibility surface that remains open after the bounded explicit-throw and statically-nullish repairs.

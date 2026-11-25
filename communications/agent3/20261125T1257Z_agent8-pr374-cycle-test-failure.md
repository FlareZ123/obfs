# Agent 8: focused PR #374 run 45617782208 — one new cyclic test fails

Date: 2026-11-25T12:55:15.691Z  
Head: `9a1ed0c211d3080cf7b83f1130134a760c6bfa93`  
Run: https://github.com/FlareZ123/obfs/actions/runs/45617782208

I dispatched the existing focused `manual-validation.yml` workflow for `test/cross-file-reader-flow.test.js` at the exact current PR head. Both Ubuntu and Windows failed identically: **69/70 passed**; the only failure is the new test at line 557:

`two-module owner-reader cycle preserves reentrant TDZ before later successful read`

The failure is the yield assertion in `preserves()`: `output.crossFile.properties` is **0**, expected **1**. The helper fails at line 37 before executing the transformed graph, so this is not evidence of a behavior mismatch. The other 69 tests, including the other new sibling-alias and TDZ cases, passed on both platforms.

I inspected the fixture and reproduced its native ESM behavior with Node:

- Current test order in `main.mjs` imports `relay.mjs` before `state.mjs`; with the current `state.mjs` also doing `export const result=peek(state)`, native Node prints `23 23`. The supposed early reentrant read does **not** hit TDZ.
- `peek(state)` is also called inside the exporter itself (`export const result=peek(state)`). The cross-file reader inventory intentionally excludes a reader whose binding is referenced elsewhere in its exporter (`inspectReader` sets `usedInExporter=true`), so the expected cross-file reader proof is unavailable. That explains why the compiler returns zero.

A candidate fixture that actually exercises the stated cycle is:

```js
// state.mjs
import {early} from "./relay.mjs";
export const state={secretField:23};
export function peek(owner){return owner.secretField;}

// relay.mjs
import {state,peek} from "./state.mjs";
let early;
try { early=peek(state); } catch(error) { early=error.name; }
export {early};

// main.mjs — import state first to enter the cycle through state -> relay
import {state,peek} from "./state.mjs";
import {early} from "./relay.mjs";
console.log(early,peek(state));
```

Native Node 22 prints `ReferenceError 23` for that ordering: relay reads the live imported `state` binding while it is still in TDZ, then main performs the successful read after evaluation. It also leaves `peek` unused inside its exporter, so it remains eligible for the existing exported-reader summary.

Please either:
1. change the fixture to this real TDZ shape and keep expected yield 1 only if the focused run proves it; or
2. if the compiler correctly refuses the cyclic shape, change expected yield to 0 and retain it as a conservative fail-closed control.

Do not weaken the assertion or call the current head green. The full browser-harness finding from my prior message remains separate and unresolved.

— Agent 8

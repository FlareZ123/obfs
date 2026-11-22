# SCO Atomics.wait synchronous blocking depends on the execution agent

**Classification:** intermediate compatibility research, 22 November 2026. **Author:** Agent 29. The primary security goal remains **RELEASE-BLOCKED**.

## Semantic incompatibility

Selective SCO moves private work from a browser client into a separate Node.js server. `Atomics.wait()` depends on the ECMAScript execution agent's `[[CanBlock]]` capability. Browser main threads cannot synchronously block, while Node's main agent can. [ECMAScript 2025 DoWait](https://tc39.es/ecma262/2025/multipage/structured-data.html#sec-dowait) throws TypeError for agents without suspension permission; [MDN Atomics.wait](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait) specifies that the method cannot be used on browser main threads.

```js
const cell = new Int32Array(new SharedArrayBuffer(4));
Atomics.wait(cell, 0, 1, 0);
// Node main: "not-equal". Cross-origin-isolated browser main: TypeError.
```

Node 22's result was directly asserted in the focused tests. Browser main-thread behavior is supported by published specifications and documentation; **a direct Chromium execution was not completed in this investigation**. Nonisolated browser pages can lack SharedArrayBuffer entirely, creating another difference.

## Reproducible compiler red/green control

Isolated branch [agent29/sco-atomics-canblock-20261122](https://github.com/FlareZ123/obfs/tree/agent29/sco-atomics-canblock-20261122) adds `test/sco-atomics-canblock.test.js` and external-JSDoc inclusion. The source forms include direct `.wait`, computed `['wait']`, extracted method alias, and destructured method alias. Each is compiled as a direct selected private export, one-hop private ESM import, and two-hop private ESM dependency. The matched positives are local `Atomics.load`, `Atomics.isLockFree(4)`, and ordinary field `{wait:42}` across the same depths.

Baseline source `5aee013104fde442c9b2e4a8e1d8dcb0c28431c5`: [Ubuntu/Windows intentionally RED 45007089102](https://github.com/FlareZ123/obfs/actions/runs/45007089102) admitted **12/12 unsafe relocation cases** and **9/9 legitimate positive cases**. These are compiler admission counts, not twelve live-browser exploit instances.

Candidate compiler repair [77819835099d0badaecb87702173791429fd51fc](https://github.com/FlareZ123/obfs/commit/77819835099d0badaecb87702173791429fd51fc) adds `isAtomicsRoot` using existing intrinsic alias provenance and marks static `wait`, unknown dynamic Atomics keys, and `wait` destructuring as an `agent blocking` relocation refusal in `realmStateObservation(body,true)`. Retained browser public functions use the unchanged original source. The guard only runs during compilation and adds **zero runtime instructions** to admitted functions.

Exact corrected-source [Ubuntu/Windows GREEN 45007438507](https://github.com/FlareZ123/obfs/actions/runs/45007438507) passed the same **12/12 negative and 9/9 positive tests**, including native Node baseline and strict project/external JSDoc. The intermediate behavior-green but typecheck-red [45007335978](https://github.com/FlareZ123/obfs/actions/runs/45007335978) was fixed by adding the new diagnostic literal to the function's JSDoc return union.

## Boundaries

Only direct and locally aliased source patterns are tested. Unproven computed keys are conservatively refused. Browser Workers may legally block, but no verified client-execution-agent contract exists in the compiler. A true Chromium source-pinned live comparison and broader callback/reflective alias coverage remain open. The patch is isolated pending integration review; it is a behavioral correctness repair with no demonstrated new obfuscation or integrity resistance, and the 2.5x budget is not established.

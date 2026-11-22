# SCO Atomics.wait synchronous blocking depends on the execution agent

**Classification:** intermediate compatibility research, 22 November 2026. **Author:** Agent 29. The primary security goal remains **RELEASE-BLOCKED**.

## Semantic incompatibility

Selective SCO moves private work from a browser client into a separate Node.js server. `Atomics.wait()` depends on the ECMAScript execution agent's `[[CanBlock]]` capability. Browser main threads cannot synchronously block, while Node's main agent can. [ECMAScript 2025 DoWait](https://tc39.es/ecma262/2025/multipage/structured-data.html#sec-dowait) throws TypeError for agents without suspension permission; [MDN Atomics.wait](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait) specifies that the method cannot be used on browser main threads.

```js
const cell = new Int32Array(new SharedArrayBuffer(4));
Atomics.wait(cell, 0, 1, 0);
// Node main: "not-equal". Cross-origin-isolated browser main: TypeError.
```

Node 22's result was directly asserted in the focused two-platform tests. A new COOP+COEP **cross-origin-isolated HTTP browser page** in `test/browser-integration.js` runs the same operation on the Chromium main thread with SharedArrayBuffer enabled. Real Google Chrome **157.0.8103.78** produced `Chromium PASS: /atomics-canblock.html: TypeError` at source **`5b551389cd9ff68d996ee76ac275367ce6378211`** in [full browser CI 45007975481](https://github.com/FlareZ123/obfs/actions/runs/45007975481). All other browser workflow steps and JSDoc checks passed at this exact source pin. The browser proof is actual execution, separate from the compiler's refusal tests. Nonisolated browser pages may lack SharedArrayBuffer entirely.

## Reproducible compiler red/green control

Isolated branch [agent29/sco-atomics-canblock-20261122](https://github.com/FlareZ123/obfs/tree/agent29/sco-atomics-canblock-20261122) adds `test/sco-atomics-canblock.test.js` and external-JSDoc inclusion. The source forms include direct `.wait`, computed `['wait']`, extracted method alias, and destructured method alias. Each is compiled as a direct selected private export, one-hop private ESM import, and two-hop private ESM dependency. The matched positives are local `Atomics.load`, `Atomics.isLockFree(4)`, and ordinary field `{wait:42}` across the same depths.

Baseline source `5aee013104fde442c9b2e4a8e1d8dcb0c28431c5`: [Ubuntu/Windows intentionally RED 45007089102](https://github.com/FlareZ123/obfs/actions/runs/45007089102) admitted **12/12 unsafe relocation cases** and **9/9 legitimate positive cases**. These are compiler admission counts, not twelve live-browser exploit instances.

Candidate compiler repair [77819835099d0badaecb87702173791429fd51fc](https://github.com/FlareZ123/obfs/commit/77819835099d0badaecb87702173791429fd51fc) adds `isAtomicsRoot` using existing intrinsic alias provenance and marks static `wait`, unknown dynamic Atomics keys, and `wait` destructuring as an `agent blocking` relocation refusal in `realmStateObservation(body,true)`. Retained browser public functions use the unchanged original source. The guard only runs during compilation and adds **zero runtime instructions** to admitted functions.

Exact corrected-source [Ubuntu/Windows GREEN 45007438507](https://github.com/FlareZ123/obfs/actions/runs/45007438507) passed the initial **12/12 negative and 9/9 positive tests**, including native Node baseline and strict project/external JSDoc. An expanded alias grid at exact **`64bcf68adac7941a5bce0456db3e39c831a0452e`** added seven additional Atomics-root/global/method aliases, obtaining **33/33 correctly refused source/depth cases and 9/9 positive admissions**, strict JSDoc and both operating systems [CI 45007776473](https://github.com/FlareZ123/obfs/actions/runs/45007776473). The existing private host-effect closure suite at that same pin passed both operating systems and JSDoc [CI 45007846685](https://github.com/FlareZ123/obfs/actions/runs/45007846685). The intermediate behavior-green but typecheck-red [45007335978](https://github.com/FlareZ123/obfs/actions/runs/45007335978) was fixed by adding the new diagnostic literal to the function's JSDoc return union.

## Boundaries

Direct, computed, global-root and local alias patterns are tested; opaque callbacks and reflective extraction remain open. Unproven computed keys are conservatively refused. Browser Workers may legally block, but no verified client-execution-agent contract exists in the compiler. The direct real Chromium main-thread comparison is complete at the pinned browser source; authenticated SCO HTTP browser private relocation for this exact primitive is not directly exercised because the corrected compiler refuses its admission. The patch remains isolated pending integration review; it repairs behavioral correctness with no demonstrated new obfuscation or integrity resistance, and the 2.5× budget remains unestablished.

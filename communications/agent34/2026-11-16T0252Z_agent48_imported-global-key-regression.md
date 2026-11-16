# Agent 48: independently reproduced imported-global-key coverage regression in full source-observer workflow

Sender: **Agent 48**, 2026-11-16 ~02:52 UTC. This concerns `test/cross-file-source-byte-reader.test.js:212-229`, which expected one closed-world property rename with imported `const key="otherGlobal"` and `globalThis[key]`.

The same `0 !== 1` mismatch appears on **Ubuntu and Windows** at two independently pinned commits:
- Original compiler (before Agent 48 source-guard changes): SHA `1501a8fbb95e001aebaf2d5b354690e57634ade6`, [targeted run 43791947182](https://github.com/FlareZ123/obfs/actions/runs/43791947182), test 133 failed.
- Source-guard candidate: SHA `2a2811cbec393687f709a93f3fa7ae1fdefbd59a`, [targeted run 43792977075](https://github.com/FlareZ123/obfs/actions/runs/43792977075), test 133 failed identically.

Thus it predates Agent 48's `src/ast.js` modifications. The intended positive fixture is:
```js
// state.mjs
export const key="otherGlobal";export const state={secretField:23};
// main.mjs
import {state,key} from "./state.mjs";
console.log(state.secretField,globalThis[key]);
```
The `obfuscateFiles(...,{mode:'coo',closedWorld:true,strings:false,identifiers:true})` metric `crossFile.properties` is **0**, expected **1**. Native execution itself succeeded. Please triage the imported-key proof vs distributed-source guard carefully, retaining any sound refusal if reflection cannot be proven safe; if the expectation is wrong, document the native behavioral witness and coverage loss. This failure is unrelated to the two Agent48 benign-positive controls, which are being corrected separately. No release claim should be made from current full matrix.

# Agent 23 → source-observer integrators: three distinct SNO native Storage reflection sinks

**Date:** 27 November 2026, 20:43 UTC. **Status:** test-only acceptance-donor evidence, no compiler fix, no security claim.

Source parent **current-main pin `53bb9627d85c2f95c66d86be9e747a50c150e1be`**, isolated test branch `agent23/sno-storage-reflective-webidl-20261127`, actual head **`a10aa2c532bf4435bf030c0505aaa3518c29288c`**. Sole change: add `test/sno-storage-reflective-sinks.test.js`; no `src/`, workflow, or package edits. Each fixture generates native and transformed single-entry SNO launcher packages, executes them under **real Node22 `--experimental-webstorage`** with separate database files, and compares the **whole** JSON `stored/propertyValue/value/independent`. A native-only local spelling mutation changes the captured callback text but not its numeric return, independently proving the lexical source oracle's sensitivity.

[Focused run 46065302387](https://github.com/FlareZ123/obfs/actions/runs/46065302387) is **RED on Ubuntu and Windows: 3 passed, 3 failed per OS**:
- **RED** `Reflect.set(localStorage,"nativeReflectValue",inspect)`: native source contains `sourceSensitive`, emitted source contains renamed `_ve322589fe000`, numeric 47 and 9 retained.
- **RED** `Object.assign(localStorage,{nativeReflectValue:inspect})`: same native source vs emitted renamed `_v718d1c6b5a3e`, numeric outputs retained.
- **RED** `Object.defineProperty(localStorage,"nativeReflectValue",{value:inspect,writable:true,enumerable:true,configurable:true})`: native source vs emitted `_vee5e70426ece`, numeric outputs retained.
- **GREEN ×3** matched primitive-value dispatches on the same native Storage operations, native/emitted full JSON parity. These log but **do not demand** independent identifier rewrite, because an unproved reflective host path may legitimately be conservatively refused.

JSDoc and full Node gates were skipped due focused red; this run cannot satisfy complete integration acceptance or 2.5×. This is a **different effect entrypoint** from the direct `localStorage.namedSource=inspect` assignment or the interfile receiver-return case. In Node22 native Web Storage, these operations reached the source-stringifying legacy platform object even if its visible `setItem` method was replaced. The proposed direct `AssignmentExpression` guard alone does not establish correct handling of these reflective operations; there is no patched candidate tested here. The more general reflection/receiver/argument-provenance obligation should be separately reviewed, or unknown-host paths refused under an explicit compatibility contract.

**Host caution:** A local **Node22.16.0** preflight `Reflect.set(localStorage,'x','value',{})` with *different explicit receiver* terminated Node with `SIGSEGV` (exit 139). This is a **native experimental Node runtime** observation, unrelated to our obfuscator, and **that variant is excluded** from the CI tests; no claim about Node22.23.4 or browsers follows. Avoid adding it blindly to the default runner without isolating it in a subprocess.

Please preserve the exact 3-red/3-green source pin and include any reviewed tests in the **one** current-main integration/acceptance head rather than merging a separate production branch. The broader three-mode strong-obfuscation release remains **NO-GO**.

— Agent 23

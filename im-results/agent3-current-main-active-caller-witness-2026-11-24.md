# Agent 3: current-main reproduction of external active-caller source leak

**Date:** 2026-11-24  
**Classification:** reproducible current-main semantic source-parity failure  
**Production status:** no production source changed; this is a test-only research branch.

## Exact source pin

- Main base at branch creation: `2562cdfc18abfb00e4a6ad48d1f61a219d0b6f8d`
- Test-only branch: `agent3/current-main-active-caller-witness-20261124`
- Branch test commit: `7b12b9f50926788d5b4e6ccaee9ea911c0107ebf`
- Current-main `src/properties.js` blob at the base: `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`
- Test: `test/agent3-current-main-active-caller-witness.test.js`
- Workflow: `manual-validation.yml`, focused test only
- Run: [45300109076](https://github.com/FlareZ123/obfs/actions/runs/45300109076)
- Runtime: Node 22.23.4
- Result: **3/3 failures on Ubuntu and 3/3 on Windows** (COO, SNO and SCO core-API modes). The focused test step failed, so strict JSDoc steps were skipped. The full Node 22 job was skipped by focused mode.

The branch adds only this test file; production source blobs are inherited unchanged from the main base.

## Minimal witness

The input is CommonJS and contains a directly invoked private helper, a local owner object and a free `getExternal()` call. The test harness injects `getExternal` as a sloppy function created outside the source graph. During the call it captures `arguments.callee.caller`; after the public entry returns, the harness reads `Function.prototype.toString` from the captured function.

The input contains no explicit `Function#toString`, `caller`, `arguments.callee`, `Error.stack` or other source-reader expression. The runtime result assertion passes: native and emitted execution both return **43**. The subsequent exact-source assertion fails in all three modes.

Native observed source:

```js
function hidden(){const owner={secretField:41,otherField:2};getExternal();return owner.secretField+owner.otherField;}
```

Emitted observed source:

```js
function hidden(){const owner={"_p3718a530a7":41,"_pc1e0d331af":2};getExternal();return owner._p3718a530a7+owner._pc1e0d331af;}
```

The two private owner keys are renamed while the helper is active. This confirms the source-parity failure on the current-main property implementation, not merely on Agent 9's older research branch.

## Interpretation

Current main's `privateFunctionNodes` proof admits a function whose in-file binding uses are direct non-optional call-callee references. It treats the function as private from a heap/value-escape perspective. The external callback does not receive the function object; it observes the active caller through the runtime's caller accessor. Therefore a value-only escape analysis cannot prove source privacy.

The shared plan needs an `UnknownHostEffect` / reverse `DynamicFrame` edge from the unknown synchronous callback callsite to the active callable, then must protect that callable's source/owner closure. This effect is distinct from explicit source-reader syntax and from a callable escaping into the heap.

Agent 9's focused ambient-call prototype supplies separate two-platform positive controls for pure helpers and uninvoked nested closures (runs 45292685943, 45293458665 and 45293900434). Those remain donor evidence, not an integrated fix.

## Scope and limits

- The three mode labels exercise `obfuscateFiles(...,{mode})` core-API behavior. They are not CLI validation.
- This is a Node sloppy-caller witness. It does not exercise real Chromium, actual SCO `createScoHandler` request-time/browser behavior, or the SNO CLI launcher.
- It is a semantic source-parity counterexample, not a claim that DevTools or arbitrary instrumentation can be prevented.
- No production source, candidate branch or release claim is changed.

**Disposition:** retain as a current-main red control for the shared source/effect plan. A future candidate must pass it while retaining Agent 9's unrelated positive-yield controls.

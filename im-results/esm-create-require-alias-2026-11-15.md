# Node ESM `createRequire` bypass of closed-world property proof

Date: 2026-11-15. Author: Agent 6. Status: intermediate regression and conservative remediation; manual shared CI passed.

## Failure mechanism

`renameCrossFileProperties` discovers consumers from canonical relative static ESM imports and declines explicit `ImportExpression` uses. Node 22 ESM can construct a CommonJS `require` function via `node:module` or `process.getBuiltinModule('module')`. It can synchronously read an eligible `.mjs` export through an untracked route. The property proof could rename the key while its consumer still requests the original key.

Two-file counterexample:

```js
// state.mjs
export const state = { secretField: 11 };
```

```js
// main.mjs
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
console.log(req('./state.mjs').state.secretField);
```

The original prints `11`. If the exported property becomes `{_pEXAMPLE:11}` while the consumer keeps `.secretField`, that read yields `undefined`. The actual hash-dependent pre-fix transformed output was not captured locally.

Node's ESM documentation describes `module.createRequire()` and synchronous `require(esm)` for modules without top-level await: https://nodejs.org/download/release/v22.23.0/docs/api/esm.html

## Conservative remediation

`src/cross-properties.js` now declines closed-world property renaming when a module imports `node:module` or calls an identifier or statically named member `require`, `createRequire`, or `getBuiltinModule`, including literal-computed member names. This may decline safe graphs and should remain fail-closed until alternate-loader resolution is proven. It adds no client runtime instructions.

`test/esm-create-require-ambiguity.test.js` has named and namespace `node:module` imports, `process.getBuiltinModule`, and a positive control where canonical static ESM imports remain renameable.

## Evidence and outstanding validation

Local Node v22.16.0 execution confirmed that both `createRequire(import.meta.url)` and `process.getBuiltinModule('module').createRequire(import.meta.url)` load the `.mjs` state module and print `11`. Local Acorn parsing plus the patched syntactic decision marked all three loader patterns ambiguous and kept the canonical named-import case eligible.

Independent manual validation [run 43680910562](https://github.com/FlareZ123/obfs/actions/runs/43680910562), dispatched on 2026-11-15 05:23:56 UTC, passed the behavioral/adversarial suites, JSDoc typecheck and performance sample on Node 22 Ubuntu and Windows. Ubuntu also passed the real Chromium module/host-lock step; that step was skipped on Windows. The run head `daab1bb9694b8fd76f767aa3f15e0172c3bada3b` is a descendant of the guarded implementation commit `eb5b9ec872e5cab0325fabec534348b7ed850cfe` (confirmed via GitHub compare), so the regression and guard were included. The local runtime could not resolve github.com for a clone, and tests were verified from the independent manual workflow rather than locally.

Dynamic global lookups, loader hooks, in-memory module evaluation and runtime injection remain outside this syntactic proof. A complete soundness argument needs stronger execution-environment assumptions and module-loader analysis.

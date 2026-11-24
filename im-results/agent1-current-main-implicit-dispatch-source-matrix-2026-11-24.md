# Current-main implicit-dispatch active-frame source matrix

**Date:** 2026-11-24  
**Status:** 13/14 implicit-dispatch constructs produce source mismatches in current-main COO and SNO; the sole source-parity control is a file-wide zero-yield `with` veto. Test-only branch; no compiler change.

## Reproduction and pins

Test-only branch: `agent1-forof-active-frame-transform-check-20261124`, final matrix commit `c24ec8dbfde9b7818be7fc0b44162b3fd5ee5a8e`. Test file: `test/agent1-current-main-implicit-dispatch-source-matrix.test.js`. No `src/` file was changed.

Final focused workflow: [45314013700](https://github.com/FlareZ123/obfs/actions/runs/45314013700), manual-validation.yml, input `focused_test=test/agent1-current-main-implicit-dispatch-source-matrix.test.js`. Node v22.23.4. Both Ubuntu and Windows ran 28 cases (14 operations × COO/SNO): **26 failed exact-source parity and 2 passed**. The two passes are the `with`/Proxy HasBinding cases, one per mode.

The harness executes each CommonJS fixture from a temporary real `.cjs` module using Node's loader, so V8 CallSite function capture is available for the async PromiseResolve control. A host-controlled iterable, Proxy, accessor, coercion object or thenable invokes an external callback while private `hidden()` is active; the host reads its source. A separate private `plain()` helper is an unrelated positive-yield control.

Production-source pins: `src/properties.js` blob `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`; `src/core.js` blob `8d33996821650de540b87502baff00a9e7ea99c7`.

## Results

| Implicit operation in `hidden()` | COO | SNO |
|---|---:|---:|
| `for...of` / IteratorNext | **Mismatch** | **Mismatch** |
| `in` / Proxy `has` | **Mismatch** | **Mismatch** |
| `for...in` / Proxy `ownKeys` | **Mismatch** | **Mismatch** |
| `for...in` / Proxy `getPrototypeOf` | **Mismatch** | **Mismatch** |
| `instanceof` / custom `Symbol.hasInstance` | **Mismatch** | **Mismatch** |
| `delete` / Proxy `deleteProperty` | **Mismatch** | **Mismatch** |
| Object destructuring / Proxy `get` | **Mismatch** | **Mismatch** |
| Array destructuring / IteratorNext | **Mismatch** | **Mismatch** |
| Assignment / Proxy `set` | **Mismatch** | **Mismatch** |
| Assignment / accessor setter | **Mismatch** | **Mismatch** |
| Arithmetic / `Symbol.toPrimitive` | **Mismatch** | **Mismatch** |
| `await` / PromiseResolve thenable `then` getter | **Mismatch** | **Mismatch** |
| `for await...of` / AsyncIteratorNext | **Mismatch** | **Mismatch** |
| `with` / Proxy `has` during binding lookup | Source parity, zero yield | Source parity, zero yield |

Every one of the 13 failing operations reports `metrics.properties: 2`, `ownerKeyStillSpelled: false` and `unrelatedKeyStillSpelled: false`. The observed helper source changes from `...return owner.secretField;` to `...return owner._p8cd7f82ef2;`; the unrelated `plain()` owner key is also renamed. All cases preserve the returned value. Thus these are real source-observation failures with nonzero unrelated rewrite yield, not file-wide refusal or ordinary behavioral regressions.

The `with` control is different: it preserves exact source parity only because the current `WithStatement` veto refuses all property transformations. A separate yield characterization (`test/agent1-with-active-frame-positive-yield.test.js`; initial run [45311192872](https://github.com/FlareZ123/obfs/actions/runs/45311192872)) observed `properties: 0` and left `unrelatedField` unchanged. The follow-up test now characterizes that zero-yield behavior explicitly.

## Interpretation

Current-main property proof does not account for the reverse active-frame effect of these implicit runtime operations. They execute host-controlled callbacks without an explicit CallExpression in `hidden()`. The effect graph needs to represent at least:

- `IteratorDispatch` for `for...of` and array destructuring;
- `ProxyHas` for `in`;
- `ProxyEnumeration` / `ProxyInternalMethod` for `for...in` own-key and prototype traversal;
- `CustomHasInstance` for `instanceof`;
- `ProxyDelete` for `delete`;
- `ProxyGet` / `AccessorCall` for object destructuring;
- `ProxySet` and `AccessorCall` for assignment setters;
- `ToPrimitiveDispatch` for arithmetic coercion;
- `PromiseThenableAssimilation` for implicit Get(`"then"`) during `await`;
- `AsyncIteratorNext` for `for await...of`;
- the existing `WithBindingLookup` veto for `with`.

Each event that can execute user code must create an appropriate reverse `DynamicFrame` effect on the active callable, and exact-source effects must close over the affected function source and semantic edits. The unrelated `plain()` helper should remain independently rewritable; a file-wide veto hides the source leak by sacrificing all property yield.

## Scope and limits

- Confirmed: sloppy CommonJS, synchronous host-supplied objects/proxies/accessors/coercion objects/thenables, plus host async iterators for `for await...of`, current-main COO and SNO, Node v22.23.4 on Ubuntu and Windows.
- Not established: strict-mode active functions, browser DevTools/debugger extraction, classic-script property-renaming yield (the script path is a no-op for the fixture), other async-iterator methods, or multi-file SCO. SCO Node/CommonJS ForOf, ToPrimitive and PromiseResolve are separately confirmed in `im-results/agent1-sco-forof-active-frame-source-observer-2026-11-24.md`.
- This is an intermediate correctness characterization. It is not an academic result, a compiler fix, or a release acceptance result. The repository remains NO-GO / RELEASE-BLOCKED.
- The 13-operation matrix red run [45312383489](https://github.com/FlareZ123/obfs/actions/runs/45312383489) had 24/26 failures; that 13-case file passed strict project/external/paired-budget JSDoc on both OS in [45312562606](https://github.com/FlareZ123/obfs/actions/runs/45312562606). The final 14-case matrix red run [45314013700](https://github.com/FlareZ123/obfs/actions/runs/45314013700) had 26/28 failures; the added `for await...of` case has not received a separate passing JSDoc run. The explicit With zero-yield characterization passes on both OS with strict JSDoc in [45312608205](https://github.com/FlareZ123/obfs/actions/runs/45312608205).

Agent 3 owns integration; this report does not propose a competing compiler patch or PR.

— Agent 1

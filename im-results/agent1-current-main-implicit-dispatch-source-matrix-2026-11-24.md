# Current-main implicit-dispatch active-frame source matrix

**Date:** 2026-11-24  
**Status:** 10/11 implicit-dispatch constructs produce source mismatches in current-main COO and SNO; test-only branch; no compiler change.

## Reproduction and pins

Test-only branch: `agent1-forof-active-frame-transform-check-20261124`, matrix commit `3db4542fc493d5b09e244c4889b8831bad001b65`. The branch adds `test/agent1-current-main-implicit-dispatch-source-matrix.test.js`; the branch also retains the single-case ForOf red test. No `src/` file was changed.

Focused workflow: [45309327086](https://github.com/FlareZ123/obfs/actions/runs/45309327086), manual-validation.yml, input `focused_test=test/agent1-current-main-implicit-dispatch-source-matrix.test.js`. Node v22.23.4. Both Ubuntu and Windows jobs ran 22 cases (11 operations × COO/SNO): 20 failed exact-source parity and 2 passed. The two passes are the `with`/Proxy HasBinding cases, one per mode.

Production-source pins match the preceding ForOf report: `src/properties.js` blob `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`; `src/core.js` blob `8d33996821650de540b87502baff00a9e7ea99c7`.

The harness is an obfuscator-transform extension of `sims/agent24_implicit_dispatch_active_frame_matrix.js`. Each case builds a host-controlled iterable, Proxy or accessor whose sloppy callback captures the active private `hidden()` function via `arguments.callee.caller.caller`; the host reads the captured function source. A separate private `plain()` helper is an unrelated positive-yield control.

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
| `with` / Proxy `has` during binding lookup | Source parity | Source parity |

Every failing case reports `metrics.properties: 2`, `ownerKeyStillSpelled: false` and `unrelatedKeyStillSpelled: false`. The observed helper source changes from `...return owner.secretField;` to `...return owner._p8cd7f82ef2;`; the unrelated `plain()` owner key is also renamed. All cases preserve the returned value. This establishes a real source-observation failure with nonzero unrelated rewrite yield, not a file-wide refusal or an ordinary behavioral regression.

The `with` case is the only passing control and is consistent with the existing explicit `WithStatement` veto recorded by Agent 3. This test establishes source parity for that fixture; it does not establish whether unrelated property yield remains in that case.

## Interpretation

The current-main property proof does not account for the reverse active-frame effect of these implicit runtime operations. The failing constructs execute host-controlled callbacks without an explicit CallExpression in `hidden()`. The effect graph therefore needs to represent at least:

- `IteratorDispatch` for `for...of` and array destructuring;
- `ProxyHas` for `in`;
- `ProxyEnumeration` / `ProxyInternalMethod` for `for...in` own-key and prototype traversal;
- `CustomHasInstance` for `instanceof`;
- `ProxyDelete` for `delete`;
- `ProxyGet` / `AccessorCall` for object destructuring;
- `ProxySet` and `AccessorCall` for assignment setters;
- the existing `WithBindingLookup` veto for `with`.

Each event that can execute user code must create an appropriate reverse `DynamicFrame` effect on the active callable, and exact-source effects must close over the affected function source and semantic edits. The positive `plain()` control should remain independently rewritable; a file-wide veto would hide the source leak by sacrificing unrelated yield.

## Scope and limits

- Confirmed: sloppy CommonJS, synchronous host-supplied objects/proxies/accessors, current-main COO and SNO, Node v22.23.4 on Ubuntu and Windows.
- Not established: strict-mode active functions, asynchronous iterator source capture, browser DevTools/debugger extraction, classic-script group semantics, or SCO request-time behavior.
- This is an intermediate correctness characterization. It is not an academic result, a compiler fix, or a release acceptance result. The repository remains NO-GO / RELEASE-BLOCKED.
- The initial diagnostic version of this matrix (before the final source-parity assertion) passed the focused test and strict project/external/paired-budget JSDoc on both OS in run [45309161368](https://github.com/FlareZ123/obfs/actions/runs/45309161368). The final red assertion adds no new types; a final passing typecheck is still desirable.

Agent 3 owns integration; this report does not propose a competing compiler patch or PR.

— Agent 1

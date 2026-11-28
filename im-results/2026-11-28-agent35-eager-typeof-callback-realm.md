# Eager callback and accessor effects inside `typeof` — SCO source-admission frontier

**Date:** 28 November 2026. **Scope:** intermediate correctness evidence, **not** a release or protection-strength result. Branch: `agent35/sco-typeof-callback-host-boundary-20261128`. Source-only negative control: `f719dd019782f959c2ad25d286dbaa1d486d2e98`. Initial compiler guard: `f7cb1267cb319d87d507df8870a8101e0978c2bc`. Expanded native-browser fixture: `d922e633d074bbb3a45c554347028675a89a33ad`.

## Why the `typeof` operand is not automatically inert

ECMAScript evaluates the operand before computing its `typeof` tag, except for special unresolvable-reference handling. A lexical function expression or arrow returned **as the operand itself** is inert (its body is not evaluated). A function nested inside an operand is not necessarily inert. Calls to `Array.prototype.map`, `flatMap`, `filter`, `Array.from`, a getter, a proxy trap or a generator `.next()` can run that function while computing the operand.

The prepatch `firstUnprovedTypeofReference` in `src/sco-selective-partition.js` skipped nested function bodies unless the nested function node was itself the direct callee or tag of a syntactic call. That syntactic test does not capture native callbacks or implicit accessor evaluation. For instance:

```js
export async function protectedOp() {
  return typeof [0].map(() => process)[0];
}
```

In Node, the free `process` name is present; in a vanilla browser it is absent. A selected SCO export relocated from the browser to a trusted Node process therefore cannot claim browser-native parity for this expression without an explicit environmental contract.

## Independent native runtime evidence

A locally executed, original-source ESM matrix (no obfuscator involvement) produced the following outputs under **Node v22.16.0 (Linux)** and **real Chromium 144.0.7559.96 (Linux, Debian 13)**:

| Eager callback/accessor shape | Node original result | Chromium original result |
|---|---|---|
| `Array.map` | `"object"` | `ReferenceError` |
| `Array.flatMap` | `"object"` | `ReferenceError` |
| `Array.filter` | `"number"` | `ReferenceError` |
| `Array.every` | `"boolean"` | `ReferenceError` |
| `Array.some` | `"boolean"` | `ReferenceError` |
| `Array.find` | `"number"` | `ReferenceError` |
| `Array.forEach` | `"undefined"` | `ReferenceError` |
| `Array.reduce` | `"object"` | `ReferenceError` |
| `Array.from` mapping | `"object"` | `ReferenceError` |
| string `replace` callback | `"string"` | `ReferenceError` |
| `Array.sort` comparator | `"object"` | `ReferenceError` |
| object getter | `"object"` | `ReferenceError` |
| `Proxy` get trap | `"object"` | `ReferenceError` |
| generator `.next()` | `"object"` | `ReferenceError` |
| optional-chain `map` callback | `"object"` | `ReferenceError` |

The source strings and runtime oracles are embedded in `test/sco-typeof-callback-host-boundary.test.js`. Each shape wraps its expression in an original ESM `async function protectedOp`; the Chromium run imports `data:text/javascript` modules and evaluates the same exported function. No properties of generated output are needed to demonstrate the native cross-host divergence. A small independent `vm.runInNewContext` control also reproduces the absence of `process`, but does not substitute for Chromium.

## Proposed conservative admission boundary

The candidate patch permits the function-body exemption only when a `FunctionExpression` or `ArrowFunctionExpression` is **the complete direct operand** of `typeof`. It inspects references inside other nested function bodies, allowing unproved host names to trigger rejection. This deliberately overrefuses some inert function literals stored in arrays/records. The test includes positive controls for a direct inert function operand, constant-only callbacks and locally owned `process` literals; a separate declared private ESM graph getter control checks the audited dependency path.

**Red-first defect reproduced on both OSes.** [Test-only baseline run 46105228786](https://github.com/FlareZ123/obfs/actions/runs/46105228786) completed **failure** on both Ubuntu and Windows at source `f719dd019782f959c2ad25d286dbaa1d486d2e98`. Both focused jobs reported `Missing expected exception: return typeof [0].map(()=>process)[0];`: the current-main compiler admitted the cross-realm callback. This is a source-specific *admission counterexample*, not a demonstrated exploit against protected server state.

**Cross-platform patched acceptance is not yet established.** The initial patched two-OS test [46105418874](https://github.com/FlareZ123/obfs/actions/runs/46105418874) and intermediate browser run [46105732873](https://github.com/FlareZ123/obfs/actions/runs/46105732873) were still queued at this checkpoint. An exact-head full acceptance result is unknown. Do not interpret this source correction as independently validated until the claimed tests actually complete.

## Relation to existing donors and limitations

Agent 35's earlier unmerged indexed free-reference guard (`agent35/sco-known-node-ambient-parity-20261123`) already rejects many free `process` reads, including several callback shapes, by scanning all unqualified references; that broader donor may subsume this targeted repair after integration. The current-main scanner lacks it. A side-by-side exact-source test is needed before claiming the new guard adds protection over that donor.

This change affects compile-time **admission**, not runtime execution of admitted artifacts, and does not provide a new measured attacker-cost advantage over equally trusted minification. It does not prove all indirect invocation paths, default host globals, arbitrary callbacks, static dependency semantics, or browser/native parity. Private server-only code can intentionally use Node globals under a separately reviewed trust contract. The project's full COO/SCO/SNO strong-protection and 2.5× claims remain **RELEASE-BLOCKED**.

# Eager callback and accessor effects inside `typeof` — SCO source-admission frontier

**Date:** 28 November 2026. **Scope:** intermediate correctness evidence, **not** a release or protection-strength result. Branch: `agent35/sco-typeof-callback-host-boundary-20261128`. Source-only negative control: `f719dd019782f959c2ad25d286dbaa1d486d2e98`. Initial compiler guard: `f7cb1267cb319d87d507df8870a8101e0978c2bc`. Expanded native-browser fixture: `ac4d172e3de22d2724e238576d7d1e853be9b8fa`.

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
| `JSON.stringify` `toJSON` method | `"string"` | `ReferenceError` |
| array `join` `toString` method | `"string"` | `ReferenceError` |
| `String` implicit `toString` | `"string"` | `ReferenceError` |
| `Object.assign` source getter | `"string"` | `ReferenceError` |

The source strings and runtime oracles are embedded in `test/sco-typeof-callback-host-boundary.test.js`. The explicit callback set and these four implicit-invocation examples were executed locally against original Node and Chromium ESM with the displayed results. As a counterweight, `typeof [()=>process]` and `typeof Object.keys({get x(){return process}})` both produced `"object"` natively in Node and Chromium: they construct/store functions without executing their bodies. The candidate is intentionally conservative for such complex operands and may decline them even though these particular original outcomes match. By contrast, the direct operand `typeof (()=>process)` is inert and yielded `"function"` in both runtimes; it retains a positive compile-admission control. These observations separate *native runtime divergence* from the separate *compiler refusal policy*.

Each shape wraps its expression in an original ESM `async function protectedOp`; the Chromium run imports `data:text/javascript` modules and evaluates the same exported function. No properties of generated output are needed to demonstrate the native cross-host divergence. A small independent `vm.runInNewContext` control also reproduces the absence of `process`, but does not substitute for Chromium.

## Proposed conservative admission boundary

The candidate patch permits the function-body exemption only when a `FunctionExpression` or `ArrowFunctionExpression` is **the complete direct operand** of `typeof`. It inspects references inside other nested function bodies, allowing unproved host names to trigger rejection. This deliberately overrefuses some inert function literals stored in arrays/records. The test includes positive controls for a direct inert function operand, constant-only callbacks and locally owned `process` literals; a separate declared private ESM graph getter control checks the audited dependency path.

**Red-first defect reproduced on both OSes.** [Test-only baseline run 46105228786](https://github.com/FlareZ123/obfs/actions/runs/46105228786) completed **failure** on both Ubuntu and Windows at source `f719dd019782f959c2ad25d286dbaa1d486d2e98`. Both focused jobs reported `Missing expected exception: return typeof [0].map(()=>process)[0];`: the current-main compiler admitted the cross-realm callback. This is a source-specific *admission counterexample*, not a demonstrated exploit against protected server state.

**Focused patched acceptance is established for the scoped corpus.** Initial two-OS source [46105418874](https://github.com/FlareZ123/obfs/actions/runs/46105418874) passed; real Chromium one-case [46105732873](https://github.com/FlareZ123/obfs/actions/runs/46105732873) passed; and **expanded 19-case** [46106169242](https://github.com/FlareZ123/obfs/actions/runs/46106169242) passed on Ubuntu and Windows at exact source `12bba6230e5e8d55a43d1fde4f82bf726525cb63`, including private ESM dependency getter controls and strict project/external/paired-budget JSDoc. The Ubuntu log records `nativeCases:19`, `browserReferenceErrors:19`, `compilerRefusals:19`; Windows ran compiler checks and intentionally skipped real Chromium. The full SCO authorization run [46106172626](https://github.com/FlareZ123/obfs/actions/runs/46106172626) on that same source was **RED in an unrelated Chromium IPv6 test**, which remained at `pending` instead of `[::1]|42` (see `test/sco-host-ipv6-browser.js:65`) after the other authenticated RPC / selected graph steps had passed. It is therefore **not** a full authorization acceptance receipt. In addition, follow-on named-callback test-only [46106245333](https://github.com/FlareZ123/obfs/actions/runs/46106245333) was **RED both OS**: `function read(){return process;} return typeof [0].map(read)[0]` remains falsely admitted by this narrower `typeof`-operand checker because the named function body is outside the operand AST. A more general free-reference scanner is under separate validation. The primary release decision remains NO-GO.

## Relation to existing donors and limitations

Agent 35's earlier unmerged indexed free-reference guard (`agent35/sco-known-node-ambient-parity-20261123`) already rejects many free `process` reads, including several callback shapes, by scanning all unqualified references; that broader donor may subsume this targeted repair after integration. The current-main scanner lacks it. A side-by-side exact-source test is needed before claiming the new guard adds protection over that donor.

This change affects compile-time **admission**, not runtime execution of admitted artifacts, and does not provide a new measured attacker-cost advantage over equally trusted minification. It does not prove all indirect invocation paths, default host globals, arbitrary callbacks, static dependency semantics, or browser/native parity. Private server-only code can intentionally use Node globals under a separately reviewed trust contract. The project's full COO/SCO/SNO strong-protection and 2.5× claims remain **RELEASE-BLOCKED**.

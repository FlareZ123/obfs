# PR384 cross-file source observation: source-pinned compatibility boundary

**Agent 25, 2026-11-28. Intermediate research evidence; not a release recommendation or academic security theorem.**

## Scope, validation design, and non-claims

The experimental JavaScript obfuscator must preserve complete program behavior, not merely exported numbers. If a real native or injected host stringifies a function, renaming a private property within that function changes the observable `Function#toString` result, even though the function's return value is unchanged. The tests below evaluate a **supplied ESM graph plus a stable external host** whose `id` setter or method coerces function values with `String(value)`. The host is preloaded via Node `--import` and is **not supplied to the obfuscator**. A separately named producer ESM module exports a function closing over a private own-record field. A third ESM module exports a primitive value from an unrelated private own-record field. Paired fresh child Node 22 processes execute native and emitted modules under identical host code. Every negative case requires real numeric parity but source-text mismatch; every positive-yield control verifies that an unrelated private key actually changes spelling.

**Scope boundary:** The fixture models the specified source-observing `DOMString` conversion as an external host API; it is **not a real Chromium IDL test**. Do not interpret its passes as a complete browser-capability proof, nor its failures as a claim about all possible DOM implementations. These results make behavioral and compile-time protection statements, **not** claims of static/dynamic attacker resistance or universal runtime bound.

## Source-pinned regression and repair

- Frozen integration source: PR [#384](https://github.com/FlareZ123/obfs/pull/384) actual head `a8a22f9aef6e7f0d487cebc23c87063376df55cb`. The PR body contains a stale older SHA.
- [Full run 46069581867](https://github.com/FlareZ123/obfs/actions/runs/46069581867): **failed on Ubuntu and Windows**, exactly seven source-observer-island positive local-field rewrite assertions. Ubuntu 5,741 passed, 7 failed and 25 skipped; Windows 5,731 passed, 7 failed and 35 skipped. The other reported typecheck, benchmark and browser steps passed.
- Compiler root cause from `src/core.js` source diff: `(!remoteSourceObserver || sourceObserverIslands.has(filename))` was replaced by `!fileSourceObserver`. It accidentally eliminated proved, opt-in ESM source-island positive property rewrites whenever another graph file observes function source.
- Minimal repair source `9c2a7e5180422d8796013892c71928190a2e0326` in [agent25/pr384-source-island-yield-fix-20261128](https://github.com/FlareZ123/obfs/tree/agent25/pr384-source-island-yield-fix-20261128):
  ```js
  if ((!remoteSourceObserver || sourceObserverIslands.has(filename)) &&
      !esmDomSourceProducers.has(filename) &&
      options.properties !== false && sourceType !== 'script') {
  ```
  [Full run 46098048218](https://github.com/FlareZ123/obfs/actions/runs/46098048218) **passed both Ubuntu and Windows**, including the full behavioral/adversarial suites, JSDoc typechecks, performance samples and Ubuntu Chromium integration.
- The separate conservative composition regression at latest `86c06b0af43392b910dea6bd3281a6c0a53d6322` asserts that a source island requested inside a graph using ambient `document`/`globalThis` is **refused** by the existing source-island proof. Its default non-island compile preserves native and emitted source. [Focused run 46098577958](https://github.com/FlareZ123/obfs/actions/runs/46098577958) **passed Ubuntu, macOS, Windows**. This is not a positive island rewrite in a DOM graph: such a claim would be unsound under the current capability restrictions.

## Source alias counterexample: red → green

- Frozen **original compiler + regression test only** `734bf5eed89c477caeaf4dd7f86cbe6d8445ff32`, [agent25/pr384-dom-alias-falsifier-20261128](https://github.com/FlareZ123/obfs/tree/agent25/pr384-dom-alias-falsifier-20261128), [focused run 46098477137](https://github.com/FlareZ123/obfs/actions/runs/46098477137): **one direct positive / one aliased negative, identical on Ubuntu/macOS/Windows**. The direct `const node=document.createElement("div")` graph passes. The aliased `const doc=document; const node=doc.createElement("div")` graph fails observable source parity. Original `function inspect(){return owner.secretField;}`; emitted `function inspect(){return owner._p06b060fd71;}`; both return `57`. The current scanner tests only direct Identifier `document` and misses the alias before source sink discovery.
- Isolated may-alias guard + paired positive independent-record key witness `7aed6eb613de19ec97f0ae7e44921c3a0d92ac2a`, [agent25/pr384-dom-document-alias-guard-20261128](https://github.com/FlareZ123/obfs/tree/agent25/pr384-dom-document-alias-guard-20261128), [focused run 46099264084](https://github.com/FlareZ123/obfs/actions/runs/46099264084): **passed Ubuntu/macOS/Windows**. It tracks direct `document` identifier aliases through declared identifier values by fixed-point may-alias propagation, freezing the observed producer but preserving a real independently renamed private key. This is **not a general interprocedural/host coercion analysis**.

## Ten-shape held-out grammar: reproducible limitations

**Source:** `0b870c83d38f5c16f4d1ffb5c5914cbbfdbeed99`, original compiler plus `test/agent25-dom-source-flow-matrix.test.js`, [agent25/pr384-dom-source-flow-matrix-20261128](https://github.com/FlareZ123/obfs/tree/agent25/pr384-dom-source-flow-matrix-20261128). **Run:** [46099476550](https://github.com/FlareZ123/obfs/actions/runs/46099476550). Each of Ubuntu, macOS and Windows recorded **2 passes / 8 failures** with identical shape classifications; the independent owner-field positive rewrite control passed in every case. Every failing case retained `value:57` and `independent:73`, yet emitted a function-source string containing a generated `_p...` field instead of `secretField`.

| Shape | Exact original PR384 compatibility |
|---|---|
| Direct `document.createElement` receiver, `node.id=inspect` | PASS |
| One-hop `const doc=document` creation alias | FAIL |
| Two-hop document alias | FAIL |
| Local `make(doc){return doc.createElement(...)}` helper | FAIL |
| `const reader=inspect;node.id=reader` callable alias | FAIL |
| `const other=node;other.id=inspect` DOM node alias | PASS |
| `node.setAttribute("id",inspect)` | FAIL |
| `Reflect.set(node,"id",inspect)` | FAIL |
| `document.createTextNode(inspect)` | FAIL |
| `put(node,inspect)` local helper that writes `node.id=fn` | FAIL |

All shapes execute complete fresh Node child ESM graphs and compare the actual host-observed source. There is no source-only textual oracle masquerading as a runtime. This matrix excludes native real-Chromium proof and additional host interfaces outside its modeled coercion sinks.

## Architectural implication, bounded next action

The present per-file, syntax-recipient `esmDomSourceProducerPaths` detection in `src/core.js` cannot establish a general safe property-rename proof by recognizing only some `document` receiver spellings. The held-out cases require at least **may-escape/callable provenance** across assignments, imports, local helper arguments/returns, and host-coercing method calls. A candidate conservative fallback was separately isolated at `833970a51515a9244fe7327c037e6747bebf090d` ([branch](https://github.com/FlareZ123/obfs/tree/agent25/pr384-imported-callable-escape-guard-20261128)) to preserve a known imported source producer whenever its value occurs outside a direct invocation, while exempting statically proved imported primitives/strings. **No claim of test success or general soundness is made without a completed source-pinned CI result**; even this fallback does not prove all reexport or callback paths.

A combined branch with two individually validated narrow fixes, tests, and strict external JSDoc registration is `dd57f886aaa5e23b99a30b0c5e813add5b797dca` ([branch](https://github.com/FlareZ123/obfs/tree/agent25/pr384-combined-parity-repairs-20261128)); [full cross-platform run 46099542091](https://github.com/FlareZ123/obfs/actions/runs/46099542091) was queued at report time. Passing that run would still **not** negate the larger ten-case matrix.

**Release and security assessment remain NO-GO** until a frozen integrated head passes the complete compatibility and browser gates, plus an independent positive attacker-cost comparison against equivalent-trust controls and credible 2.5× runtime evidence. Avoid promoting this intermediate compatibility research into `results/` or interpreting symbolic private-field spelling changes as intrinsic anti-reconstruction security.

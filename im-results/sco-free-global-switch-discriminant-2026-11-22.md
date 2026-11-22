# SCO free-global relocation and switch discriminant binding: source-pinned compatibility evidence

**Research classification:** intermediate adversarial correctness evidence, 22 November 2026. **Owner:** Agent 29. This is a companion review of [Agent 40's draft lexical free-reference proof (PR #272)](https://github.com/FlareZ123/obfs/pull/272), building on Agent 36's earlier [unqualified-free-read red witness](https://github.com/FlareZ123/obfs/commit/b67a34cb4e059c1172951413fcabad1400973edb). It does not establish strong obfuscation, attacker-cost advantage, arbitrary JavaScript parity, or 2.5× runtime compliance.

## Model and failure condition

Selective SCO moves reviewed private JavaScript execution from the original client environment into a trusted Node server. An identifier unqualified by `globalThis` can resolve to a caller-injected application global in the client but be absent on the server. Acceptance requires a lexical binding proof or a separately reviewed shared-root contract; no such proof follows solely from seeing the identifier's spelling in a sibling declaration or case block.

The same source in a Node context with `globalThis.externalBridge={value:41}` yields 41 for `return externalBridge.value`. With no such global, evaluation instead throws `ReferenceError`. This is a reproducible cross-realm correctness difference, not an attack on the original server's authorization mechanism.

## A. Mainline admission falsification with matched positive controls

The isolated branch [`agent29/sco-free-lexical-grid-20261122`](https://github.com/FlareZ123/obfs/tree/agent29/sco-free-lexical-grid-20261122) contains `test/sco-free-lexical-grid.test.js`. At exact **`6d053795795eb5660ec8d3d460eee20c623d289b`**, [focused two-platform CI 45005080453](https://github.com/FlareZ123/obfs/actions/runs/45005080453) intentionally failed with:

- **48/48 unsafe admissions**: 16 independent expression and scope shapes using free `externalBridge`, at directly selected, one-hop audited private ESM, and two-hop audited private ESM depths. Cases include reads, optional chains, nullish, arrays/records, defaulted formals, nested closures, finally, and sibling-local shadowing.
- **24/24 valid admissions retained**: eight locally bound shapes across the same three private relocation depths, including formals, catch bindings, destructuring, a nested literal shadow and inert object property names.

The refusal was the expected behavior for the unsafe cases. The current source accepted them, so CI's negative assertion was red. The adjacent current-code positive control passed on both OSes. These counts record syntactic cases and compiler decisions, not 48 independently executed browser attacks.

A separate actual authorized HTTP RPC witness `test/sco-free-lexical-rpc-witness.test.js` executes original private methods under an injected `globalThis.externalBridge`, removes the injected global to represent the server realm, and calls the emitted `createScoHandler` with `bindScoModuleExports`. Three selected expressions (`externalBridge`, `externalBridge?.value`, `externalBridge.value ?? 0`) first return their injected client values, then return **HTTP 500 `{ok:false,error:'Operation failed'}`** over authenticated RPC with the server global absent. Both Ubuntu and Windows Node 22 focused execution and strict project/external JSDoc passed at exact **`1df955969fd823b22ef79eb82803222d95a0ae95`**, [CI 45005529383](https://github.com/FlareZ123/obfs/actions/runs/45005529383). This is real HTTP inside a controlled Node process, not an external Chromium run.

## B. Candidate PR #272 proof review and independently discovered switch hole

Agent 40's draft `src/sco-free-references.js` has a scope-aware AST value-reference pass. I transplanted the unrelated 48/24 grid onto an isolated copy of their proposed source, **without changing the compiler**, at `36e275fd2fe75aaae658f90db365c38f281cdfd5`. [Ubuntu/Windows focused and both JSDoc gates 45005479068](https://github.com/FlareZ123/obfs/actions/runs/45005479068) **passed all 48 refusals and 24 positive admissions**. This is positive independent review evidence for their main lexical proof.

A new issue remained. The draft's `scopeDeclares(SwitchStatement)` made all declarations inside a `case` visible when classifying the surrounding `switch` **discriminant**, despite that expression being evaluated before `CaseBlock` lexical binding instantiation.

```js
function example() {
  switch (externalBridge) {
    case 0:
      const externalBridge = 41;
      return 42;
    default:
      return 7;
  }
}
// With globalThis.externalBridge = 0: returns 42.
// With the global missing: throws ReferenceError.
```

This order is specified in [ECMAScript 2026, §14.12.4 SwitchStatement Evaluation](https://tc39.es/ecma262/2026/multipage/ecmascript-language-statements-and-declarations.html#sec-switch-statement-runtime-semantics-evaluation): evaluate/GetValue of the discriminant, then create the case lexical environment and instantiate case declarations. Native Node separately reproduced the 42/ReferenceError distinction.

The isolated test `test/sco-switch-discriminant-lexical.test.js` uses four case-binding shapes (ordinary `const`, destructured `const`, class, function) at three relocation depths, plus two safe positive controls at three depths. Exact candidate+test source **`dd14ce11106b9408d65c56d4e3a474426d3e8536`** had **12/12 unsafe discriminants admitted** and **6/6 valid positive controls accepted** on both OSes, [red CI 45005702101](https://github.com/FlareZ123/obfs/actions/runs/45005702101). This is a bounded novel false-admission witness for draft PR #272; its early green 48/24 run never implied complete scope soundness.

## C. Independent narrow repair and scope

Commit [`ee7c292c2b94faf2c5f29208a974ed8e59f85f81`](https://github.com/FlareZ123/obfs/commit/ee7c292c2b94faf2c5f29208a974ed8e59f85f81) on [`agent29/review-free-lexical-272-20261122`](https://github.com/FlareZ123/obfs/tree/agent29/review-free-lexical-272-20261122) makes `scopeDeclares` receive the actual identifier reference and refuses to count `SwitchStatement` case declarations for a reference whose AST span is contained within its discriminant. Enclosing module, function, or block bindings are still reviewed, and genuinely case-local references retain their proof. No emitted runtime statement changes for accepted functions.

All three focused runs targeted **the same `ee7c292` source**:

| Gate | Source-pinned two-platform result |
| --- | --- |
| Switch discriminant 12 negative + 6 positive cases, project/external JSDoc | [45005821514](https://github.com/FlareZ123/obfs/actions/runs/45005821514), **passed** |
| Independent 48 negative + 24 positive free-name grid, project/external JSDoc | [45005895143](https://github.com/FlareZ123/obfs/actions/runs/45005895143), **passed** |
| Existing SCO private host-effect closure suite, project/external JSDoc | [45005988683](https://github.com/FlareZ123/obfs/actions/runs/45005988683), **passed** |

The source fix and tests remain **isolated review work** at the above branch. The Agent 40 PR #272 branch is still the integration owner; I sent direct mailbox notes with the first counterexample and the green repair pin. Promote into its branch only after normal owner reconciliation, then validate one exact combined source state. No published mainline compiler change is claimed.

## Limits

This finite corpus does not prove lexical binding correctness for all ECMAScript grammar or host environments. The live RPC witness toggles an injected global between client-like and server-like conditions in a controlled Node process; it does not exercise an actual web browser. Fewer unsafe compiler admissions improve supported-source correctness; they provide no independent source secrecy under client access and no protection against unauthorized relaying of authenticated RPC. COO/SNO remain under their own trust and execution models. The root [release decision](../results/README.md) remains **RELEASE-BLOCKED**.

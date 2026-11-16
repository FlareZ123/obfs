# Callable-value aliases: interprocedural host capability proof escape

**Agent 4, 16 November 2026. Intermediate semantic correctness result, not a secrecy result.** The actual original-versus-compiled Node ESM evidence is pinned to test-only `e8d021de3a192ab03c48a65ee6ae93616da18cec` and patched `747e818ef6d825ef1e8cfe06ba7d7786b0d6f81c`.

## Original counterexample and measured semantic red

This work builds on [PR #31](https://github.com/FlareZ123/obfs/pull/31), whose function-parameter transfer was already independently proven for direct local calls. The three-module source fixtures are in `test/closed-record-host-formal-provenance.test.js`. A published `state.mjs` exports `state={secretField:41}`; an unrelated `record.mjs` reads `Reflect.ownKeys(schema)`. An unchanged host preload defines a callback replacing `Reflect.ownKeys` which dynamically imports the published state module and enumerates `Object.keys(ns.state)`.

A computed formal binding exposes the mutable `Reflect` value:

```js
function rewire({['Ref'+'lect']:cap}) {
  cap.ownKeys=globalThis.HOST_REFLECT;
}
const alias=rewire;
alias(globalThis);
```

The original produced `[41,"audit-v1",["secretField"]]`; the generated files exposed a randomized `_p...` field. The scanner tracked direct local function calls, but discarded function-value aliases and incorrectly accepted one owner-key rename. Identical failures were reproduced for transitive aliases and an aliased arrow function. A distinct benign aliased function reading an unrelated field retained **one genuine, safe owner-key rename**.

[Pre-patch full Linux/Windows Node 22 gate 43894278009](https://github.com/FlareZ123/obfs/actions/runs/43894278009) at **test-only** SHA `e8d021de`: three newly introduced negative cases failed on each operating system, with mismatched actual outputs. The unrelated positive and the benchmark/typecheck/browser workflow steps completed successfully. No claim relies solely on source comparison.

## Narrow repair and two-platform green

A fixed-point propagation now joins the local callable-formal lists across existing identifier alias edges before collecting callsite-to-formal flows. It retains all possible bound definitions instead of choosing an arbitrary alias target. The rule is implemented inside `src/cross-properties.js::safeClosedCallerRecordRead`, at candidate code SHA `747e818e`.

[Post-patch full Linux/Windows Node 22 validation 43895037312](https://github.com/FlareZ123/obfs/actions/runs/43895037312) at exact candidate SHA `747e818ef6d825ef1e8cfe06ba7d7786b0d6f81c`: both operating-system jobs passed the Node differential suites, compiler/external strict JSDoc suites, native/emitted runtime samples, six-module positive application profiles and Ubuntu Chromium integration. The reported positive remains a distinct ordinary-program fixture with **one proven changed owner key**, separate from the three negative host-observability cases.

## Limitations and security-performance meaning

The implementation follows **syntactic identifier-to-identifier alias edges** and direct named calls. It cannot prove full flow closure through first-class higher-order values, object/array storage, imported callbacks, arbitrary `.call`/`.apply`/`.bind`, reflection, Proxy traps or hostile injected loaders. Lexical binding identity and interprocedural effect summaries remain unimplemented for arbitrary JavaScript. Under the user's COO and SNO full-control threat models, an adversary can read and copy publicly distributed scripts, so a parity repair by itself provides no measured anti-cloning gain. No universal 2.5× bound follows from finite workload samples.

The independent public-only attack in PR #31 remains valid evidence of recoverability on actually transformed COO application variants; our additional proof refusal preserves semantic correctness and does not change that threat boundary.

## Reproduction

Run the `manual-validation.yml` workflow at the cited SHAs on Node 22 Ubuntu and Windows, or run `node --test test/closed-record-host-formal-provenance.test.js` after `npm install`. Examine the exact stdout and `compiled.crossFile.properties` assertions for all cases. Keep the source-pinned negative and unchanged positive fixture counts separate.

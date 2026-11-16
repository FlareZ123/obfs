# Forwarded-owner member validation ordering: executable semantic counterexample and repair

**Agent 8, 2026-11-16.** Bounded compiler-correctness evidence. This is an intermediate engineering result, not a proof of strong obfuscation or universal JavaScript observational equivalence.

## Defect and minimal independent observations

The local property analyzer `src/properties.js::proveLocalObject` identified direct owner member accesses, checked whether they were unsafe consumers, and *later* appended additional accesses through proven identity-returning helper calls. The late-discovered members bypassed checks for method/new/tagged invocation source spelling, iterable errors, opaque member assignment, and delete exposing an inherited fallback.

The new deterministic `test/forwarded-member-consumer-validation.test.js` compiles original CommonJS input with `strings:false` and `identifiers:false` in both COO and SNO, runs native and emitted sources in fresh Node VM realms, compares exact serialized results, and requires unsafe cases to preserve original owner property names. Its positive control requires an eligible scalar read through the same identity call to rename.

Two original input contracts revealed the defect:

1. `const root={secretField:13}; function identity(x){return x;}` followed by `try{identity(root).secretField()}catch(error){output=error.message}`. The observed caught message includes `identity(...).secretField is not a function`, but the pre-fix emitted program exposed the rewritten `_p...` property name in the error text.
2. Assigning `identity(root).secretField=function(){return Object.keys(this)[0]}` and invoking that method must return `"secretField"`. The pre-fix emitter returned its private hashed property name instead.

These are exact program-output differences on the tested Node 22 runtime, not merely aesthetic changes to generated code. The [before-fix Linux/Windows gate](https://github.com/FlareZ123/obfs/actions/runs/43910362239), at commit `ca580545a4fb22a27603f8a49049ab510ca64c5b`, failed the new negative tests on both systems. The observed Windows message was `identity(...)._p2d2017caa2 is not a function` versus `identity(...).secretField is not a function`, with a separately measured reflected-key mismatch.

## Repair and preserved positive coverage

Commit `b7a298922d4faa7e33f0166cbd0a494a8de639ea` moves the existing member-consumer validation loop *after* the forwarding-call pass has added all immediate member reads to the proof list. The underlying checks themselves remain unchanged. This is a compile-time analysis correction; no new emitted runtime code or interpreter is introduced.

The same regression file now covers caught TypeError source spelling, opaque method assignment, inherited property after forwarded deletion, iterable source spelling, and a positive scalar owner read. Each case runs for COO and SNO, and the positive control still requires a real renamed property. At exact SHA `9c6d6439978f6f46beefae8442155507e56406f4`, the [full Linux/Windows Node 22 and Ubuntu Chromium gate](https://github.com/FlareZ123/obfs/actions/runs/43911132231) succeeded, including strict JSDoc checks and the existing sampled benchmarks.

The compiler's separate closed-world ESM proof calls the same local proof helper for imported object aliases and recognized identity functions. The focused real-ESM extension is `test/forwarded-crossfile-consumer-validation.test.js` (commit `4d8e5ef85b82ff4e089e16d4962c988832a1efad`), with both unsafe consumers and a positive rename control. Its independently pinned full validation is [workflow 43911946637](https://github.com/FlareZ123/obfs/actions/runs/43911946637).

## Scope and limitations

The negative tests demonstrate a real incorrect rewrite and its correction on those inputs. The positive tests demonstrate that a distinct allowed expression remains transformable. Neither test proves global alias-analysis soundness, deobfuscation cost, tamper resistance, origin locking, complete cross-engine error-string compatibility, or a universal 2.5× performance bound. TypeError spelling can itself vary across JavaScript engines; comparing native/emitted behavior within the same engine remains necessary. No result here should be promoted to `results/` as an academic strong-obfuscation claim.

Further investigations should pair newly admitted forwarding patterns with at least one counterexample for each potentially observable parent/ancestor context. Keep the original full-control attacker assumptions and measure actual transformed work rather than counting only passes.

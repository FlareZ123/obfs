# Seed-permuted dense native CFG states: performance hypothesis

**Date:** 2026-11-17. **Classification:** Intermediate candidate and methodological note. This is not a proven security or runtime-budget improvement.

## Proposed change

In the opt-in native CFG source emitter src/statement-flow.js, state numbers were originally seeded pseudo-random 32-bit integer constants. The new explicit low-level option denseStateIds:true instead assigns each real block and exit state a seed-permuted label from the contiguous set 0..N (N is block count). Case order remains independently shuffled. No default behavior changes; compactCases is a separate opt-in and can be combined with denseStateIds. This is **not yet** wired as a public COO/SNO CLI option because its runtime and security consequences require measurement.

The testable hypothesis is that the V8 engine can dispatch dense small-integer switch cases more cheaply than sparse 32-bit integers, especially for many sequential branches. The plain relationship between labels and basic blocks is public in both designs. The existing independent static attacker can recover the tested sparse layouts, so any claimed security difference must be shown by a new adversary with a fixed effort budget, not inferred from label entropy.

## Implementations and controls

- Compiler change: src/statement-flow.js, initial commit d4b635d04513c129b7e854b68d3e59824e2b8002.
- Unit test: test/statement-flow-dense-state.test.js checks 12 randomized seeds, compacted and uncompacted native semantics with observable callbacks, fully public label-range/uniqueness and normal function-source observer refusal. Public-only recoverStatementFlow decompilation is replayed against the same original. Compact absorption can remove some case labels, so the test checks complete 0..N coverage only when compactCases is disabled; it checks unique bounded state IDs in both modes.
- Paired workload script: sims/statement-flow-diamond-runtime-profile.js, first introduced to compare native, sparse ordinary and sparse compact, later expanded to compact+dense. For the same 80 sequential integer-branch diamonds, it checks 257 native outputs, reconstructs the dense function solely from emitted source, warms each function with 80,000 calls, and rotates twelve trials with 30,000 calls each across four variants. A separate twelve-trial, 100-unique-vm.Script-compilations-per-variant cold compilation proxy measures source parse/compile overhead. Records raw samples and one-sided paired-median diagnostics through sims/paired-budget-bound.js.
- Focused manual workflow: .github/workflows/manual-expression-vm.yml, Node22 Ubuntu/Windows with JSDoc and actual Ubuntu Chromium, includes both seeded dense test and paired runtime profile.

## Early local synthetic evidence

Before the actual compiler/Acorn validation, a **separate, hand-written synthetic 80-diamond dispatcher** on local Node v22.16.0 produced a median of 32.39 ms for sparse switch labels, 19.30 ms for dense labels, versus 1.43 ms for direct native if/else source over 30,000 warmed calls. Dense/sparse was 0.596x; dense/native was 13.52x, and sparse/native 22.70x. These are **single-process synthetic measurements**, not generated-source performance or a project budget result, and cannot verify the candidate. The rough trend motivates the pinned CI profile while exposing that even faster dense dispatch may still exceed the strict 2.5x criterion for this workload.

## Nonclaims and decision rule

Native CFG is currently statically reconstructable under the tested source-only attacker. Dense labels may make that reconstruction easier. The local synthetic slowdown exceeds 2.5, so no general performance or stronger obfuscation claim is warranted. Treat hot and cold results separately; neither alone bounds complete COO startup + session execution. Keep denseStateIds experimental and off by default unless actual generated-code, application-level cold/hot/whole-session comparisons and a public-only adversarial control justify a deployment envelope.

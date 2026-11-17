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


## Pinned generated-code cross-platform outcome: no-go for the 80-diamond hot workload

[Manual Ubuntu/Windows/Chromium run 44036667080](https://github.com/FlareZ123/obfs/actions/runs/44036667080) **passed** at exact commit 8abe4c2ac2b238a21ca14a747ebb7904914ab837 on Node 22.23.4. Both platforms reported **40/40 focused tests passed**, strict JSDoc and all 14 static attack rows; Ubuntu also passed the existing real Chromium page fixture. The dense-state dedicated test confirmed seed diversity, public-case label uniqueness and boundedness, regular source-observation refusal, output parity, and static clone parity.

The 80-diamond original is 3,574 bytes. At the runtime-profile seed, ordinary sparse output is 17,471 bytes, compact sparse is 17,415 bytes, and compact dense is 13,388 bytes. A source-only static attacker reconstructs the dense output to **3,654 bytes** with 257 held-out native comparisons. Dense extraction measured **17.82 ms Windows / 9.64 ms Ubuntu** in that single process.

Twelve paired measurements per platform, with workload- and order-specific 30,000 **warm function calls**, yielded these median paired slowdown ratios and the existing distribution-free one-sided lower/upper bounds for the population median:

| Variant versus native | Windows median [lower, upper] | Ubuntu median [lower, upper] | Both conclusions |
|---|---|---|---|
| Ordinary sparse | 21.879 [21.653, 22.527] | 152.219 [148.604, 154.990] | Exceeded 2.5x |
| Compact sparse | 21.942 [21.764, 22.120] | 158.320 [155.041, 163.690] | Exceeded 2.5x |
| Compact dense | 23.939 [23.582, 24.466] | 9.660 [9.586, 9.836] | Exceeded 2.5x |

The marked platform divergence is real to these executable measurements. The observed hot-function medians in milliseconds were **Windows** native 1.573, ordinary 34.285, compact 34.397, dense 37.897; **Ubuntu** native 0.583, ordinary 88.529, compact 92.416, dense 5.690. Thus dense labels improve Ubuntu's observed switch dispatch dramatically while making this Windows run slower than sparse. The held-out checks and static reconstruction pass for both. These numbers are *not* a fixed instruction-count cost or an unconditional all-machine bound.

As a separate cold compile-only proxy, twelve paired batches of 100 unique vm.Script compilations (no disk I/O, no ESM linking or execution) had median paired slowdowns: ordinary sparse **2.190 Windows / 2.323 Ubuntu**, compact sparse **2.168 / 2.339**, compact dense **2.207 / 2.485**. Existing paired one-sided upper bounds supported <=2.5 in all three Windows cases and Ubuntu compact sparse, while Ubuntu ordinary and dense remained **inconclusive** at that confidence (upper bounds 2.552 and 2.580 respectively). Cold compilation alone does not cover browser or Node startup.

**Candidate decision: all three full-switch CFG variants are ineligible for the specified 80-diamond repeated-call workload under the strict 2.5x hot compute budget.** Independently, the static attacker reconstructs the dense function, so no stronger source secrecy has been demonstrated. The feature is kept low-level experimental and off by default rather than promoted as a release protection. This narrowly supports an architecture *rejection*, not a universal statement about small CFGs, other workload shapes, or SCO server-private code.

Raw per-trial hot/cold arrays and exact measured hashes/source are encoded in the CFG_DIAMOND_BUDGET JSON lines of the pinned Windows and Ubuntu Actions job logs. See workplace/native-cfg-candidate-decision-2026-11-17.md for the candidate decision boundary.

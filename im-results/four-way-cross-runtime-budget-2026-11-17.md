# Four-way cross-runtime release evidence: one pinned source graph and separate compute boundaries

**Date:** 2026-11-17. **Status:** cross-platform source-pinned green experimental evidence with strict CPU sample breach. **Scope:** the fixed three-module COO polyvariant application and matching conventional esbuild control.

## Why this was needed

The existing [four-way selected application decision](../workplace/candidate-over-minification-decision-2026-11-17.md) uses matched source-only and three-query attacks and Node fresh-ESM sessions. Chromium evidence from [Agent 8's real-clock control](four-way-real-clock-cpu-2026-11-17.md) showed that full browser startup/import medians can obscure individual violations of the strict 2.5x **synchronous compute** ceiling. A completed CI job means the experiment ran as designed; it cannot itself certify the performance policy.

There was no machine-readable, single-run join between the exact Node application experiment and the independently measured Chromium CPU. A future candidate could appear runtime-supported on Node even if its browser CPU exhibited observed >2.5x pairs.

## Implemented evidence contract

The new [runtime verdict evaluator](../sims/four-way-cross-runtime-verdict.js) consumes the Node and Chrome JSON artifacts produced by the same manual workflow checkout. Both experiments publish the SHA-256 digest of each **actual three-file variant** using the same ordered, path-delimited UTF-8 hash routine. A mismatch in any native, esbuild, COO or publicly reconstructed graph aborts the join rather than pooling incomparable outputs. These hashes establish equality of reported source bytes conditional on the trusted CI implementation; they are not cryptographic adversary attestation.

The Chromium producer continues to require (1) a real monotonic clock advanced by a five-million-iteration CPU positive control, (2) full application output and callback trace parity, (3) four tested work counts, and (4) exactly 288 fresh three-module network fetches. The join checks those witnesses before using timings. It synthesizes **six separately paired workloads**:

- Four Node fresh-ESM application-session loads, for 1, 50, 1000 and 10000 events.
- Chromium warmed 10000-event synchronous compute, with the original run and host callback content unchanged.
- Chromium freshly imported 10000-event synchronous compute, measured after module import resolves.

A distinct browser **one-event** CPU measurement is excluded from median inference because its near-zero quantized durations cannot satisfy the existing strictly positive paired estimator. The raw event-one CPU times remain in the browser artifact. The fresh HTTP+import+compute totals remain available in the raw browser artifact for deployment investigation, separately from synchronous work.

The integrator uses the project's same six-workload Bonferroni paired median procedure. It records the exact number of observed pairs above 2.5x. **Any observed strict CPU pair above 2.5x returns sample-breached regardless of median support.** If every sampled pair is within budget, the program can report sample-supported only under the stated within-workload sampling assumptions and adequate confidence. No finite sample proves a universal 2.5x budget.

The static/black-box attack choice is kept on its own axis. The actual known three-function reconstruction with matched attacker success on both esbuild and published COO yields candidateChoice=reject; lack of attempted recovery yields inconclusive. The combined release value remains RELEASE-BLOCKED on a demonstrated strict breach or candidate rejection, otherwise RESEARCH-INCONCLUSIVE.

## Differential and falsification tests

[The focused nine-case suite](../test/four-way-cross-runtime-verdict.test.js) includes positive matched-hash observation and static candidate rejection, two warm browser CPU breaches that leave the median under 2.5x, a fresh-call CPU breach, a simulated slow HTTP import that does not count as measured compute, mismatched emitted hashes, missing browser clock/host trace, incomplete graph fetch evidence, absent selected attack recovery, and a Node-only short-session breach. The full workflow uploads an additional machine-readable JSON verdict artifact on Ubuntu, after both original Node and Chromium artifacts are present. Windows runs isolated source and attack controls and the same strict JSDoc checker.

## Boundaries

The join is specific to this frozen ESM application and browser protocol. Hash equality between two files generated in one CI checkout cannot establish external actor provenance. The 2.5x performance rule concerns compute; a full production browser resource budget would also need cold parsing/evaluation CPU, external network/API latency, memory, alternate browsers, and adversarial runtime extraction. Existing SCO and SNO release questions remain independent. No positive strong obfuscation result is claimed.

## Pinned integrated comparison, 2026-11-17 at 17:21 UTC

The [manually dispatched two-operating-system workflow 44135777833](https://github.com/FlareZ123/obfs/actions/runs/44135777833) passed the original static attacks, same-model chosen-query tests, full Node four-way graph parity, real Chrome 157 output/callback parity, fresh HTTP graph checks, **nine focused cross-runtime verifier tests**, and strict external JSDoc. Tested **executable source SHA:** `7c41e609074cea6152ac7a784770e4b1953d6f32`. Ubuntu job `134224800609`; Windows job `134224801055`. The documentation-only source commit created after workflow dispatch does not change executable bytes. Each job's original raw Node timings and the Ubuntu real-Chrome and cross-runtime JSON outputs are preserved as workflow artifacts.

On Ubuntu, the joined artifact explicitly reported matching SHA-256 digests for all four three-file source graphs, `candidateChoice=reject`, `staticAttackerVerdict=reconstructed`, `strictComputeBudget=sample-breached`, and `releaseVerdict=RELEASE-BLOCKED`. The median-based six-workload familywise diagnostic was `sample-inconclusive`, with requested 95% confidence and conservatively estimated joint coverage **at least 96.1914%** under within-workload paired-sampling assumptions. Crucially, **two of 72 joined paired measurements exceeded 2.5x**, both from actual warmed 10,000-event Chromium synchronous CPU, with maximum paired slowdown **2.54762x**. The latest sampled medians and strict violations were:

| Boundary / workload | COO/native ratio of medians | Strict CPU pairs >2.5x |
| --- | ---: | ---: |
| Node fresh 1 event | 1.35417x | 0/12 |
| Node fresh 50 events | 1.44023x | 0/12 |
| Node fresh 1000 events | 1.31814x | 0/12 |
| Node fresh 10000 events | 1.36094x | 0/12 |
| Chrome warmed 10000 events, synchronous CPU | 2.05814x | **2/12** |
| Chrome fresh 10000 events, synchronous CPU | 2.05600x | 0/12 |

This is new exact-run evidence for the stricter joined boundary rather than a substitute for Agent8's previous real-clock samples. The six-workload join cannot prove a universal upper time bound, and the observed breaches make a strict sample pass false despite some median-based outcomes being supported. The independently reconstructed protected arithmetic leaves still prevent a claim of incremental confidentiality over ordinary esbuild minification on this application.


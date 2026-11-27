# Agent 42: independent rank-five hybrid proof, harness, and evidence review

**Date:** 2026-11-24T22:12Z  
**Reviewed code head:** `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`  
**PR:** #373 (draft; research-only)

## Verdict

I found no counterexample to the quotient/section construction under the stated contract: a fixed deterministic degree-at-most-five vector oracle whose fifth-derivative joint radical has codimension five. The current 3,420 eager fast-path cap is correct. This is a narrow oracle-learning result, not an obfuscation-security result or a runtime-budget result.

## Independent algebra and accounting

Let (T_5) be the fifth finite difference. If its joint radical has codimension five, it descends to a nonzero alternating 5-form on a five-dimensional quotient, hence a vector-valued volume form. Any nonzero witness tuple is a quotient basis. The five contractions against that basis recover the five linear quotient coordinates; under the promise each contraction is either zero or the witness vector.

The section (s(y)=\sum_i y_i a_i) satisfies (s(q(x))-x\in R). Thus (H(q(x))=F(s(q(x)))) has the same fifth derivative as (F), and the linear basis correction preserves that derivative. The residual (F\oplus G) is degree at most four. For the narrower promised family (F(x)=A(x)\oplus b\oplus h(Px)), the residual is in fact affine, so the basis corrections reconstruct it exactly. For a general degree-at-most-five function with the same top-radical dimension, the residual need not be affine; the verifier/fallback remains essential.

The witness probability for six independent directions in a five-dimensional quotient is
[
p_6=\prod_{i=0}^4(1-2^{i-6})=0.586695671081543.
]
Twenty-seven trials give miss probability (4.3580153939\times10^{-11}). A miss takes exact fallback, not false acceptance.

The per-basis signature union contains at most 31 new points: for each of the five contractions, the no-(e_j) half is a subset of the already cached anchor cube; the union of the (e_j)-containing halves is exactly bounded by the 31 proper subsets of the five anchors. The section table and (F(e_j)) values are already in those caches. Therefore
[
64+63(27-1)+31\cdot32+726=3420
]
is a correct eager fast-path cap. The lazy-face cap 3,393 is also combinatorially sound if the six faces are queried sequentially (32,16,8,4,2,1 new points) and the unused all-six vertex is never queried. It is prospective only; the checked-in code remains eager.

The verifier bound is valid for a fixed degree-at-most-five oracle and a candidate fixed before independent uniform verification samples:
[
(31/32)^{726}=9.7657468774\times10^{-11}<10^{-10}.
]
The code constructs the model before it calls `drawVerify`. One auditability improvement: the worker receives the entire verifier tape in `workerData` at startup. It does not read it early, so this is not a present mathematical counterexample, but a parent-held tape released only after a candidate-ready message would make the independence boundary enforceable rather than conventional.

The exact ANF submask recurrence is correct for widths 5–32. Agent 2 independently reproduced it through width 32, including bit 31, but the checked-in peer suite itself only exercises widths 5–8. Add a direct regression against the actual JS implementation at width 32. Also document fallback query count as (|C_{pre}\cup B_5|), not always exactly 242,825: witness/signature/verifier queries may have populated cache points outside the interpolation basis.

## Independent run and artifact audit

I checked the GitHub Actions run metadata, job steps, downloaded artifacts, ZIP digests, and JSON outputs:

- Peer run [45466982074](https://github.com/FlareZ123/obfs/actions/runs/45466982074): exact head `63f2a5b...`, Ubuntu and Windows jobs succeeded; syntax, strict JSDoc, finite/fallback controls, 1,000-replicate simulation, and 50-source ensemble all completed.
- Final-head HTTP run [45467483676](https://github.com/FlareZ123/obfs/actions/runs/45467483676): exact head `63f2a5b...`, Ubuntu and Windows jobs succeeded; strict JSDoc and ten live SCO/native comparisons completed.
- Earlier corrected-head HTTP run [45464863874](https://github.com/FlareZ123/obfs/actions/runs/45464863874): exact head `5bdfe02...`, both OS jobs succeeded.
- I downloaded and re-hashed the final Ubuntu/Windows HTTP artifacts and both peer artifacts. All four SHA-256 digests match GitHub's artifact metadata and the report. Both HTTP artifacts report the same source hash `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`, mask rank 5, and top coefficient `0xb1f2257d`.
- The final-head HTTP artifacts reproduce the reported means: Ubuntu 2,056.4 baseline / 1,800.9 hybrid (10/10 hybrid-lower); Windows 2,018.2 / 1,845 (9/10). Each platform has ten samples in that run. The SCO/native arms share tapes and have matching query counts/transcripts as asserted by the harness.

Important evidence qualifications:

1. The baseline and hybrid use **separate** CSPRNG tapes. The mean difference is a valid descriptive difference between independent samples, but the per-index win fraction, median saving, and “paired” labels are not common-random-number matched-pair evidence. Do not present them as a paired statistical test.
2. The only preregistration in the branch is the 16:07 preregistration for the earlier generic top-quintic learner and its 44,836-query criterion. The hybrid was developed later (18:33); its live runs are exploratory follow-up, not preregistered confirmation. Preregister any confirmatory hybrid replication with exact algorithm/source pins, acceptance criteria, and sample plan.
3. `verifySourcePromise` checks the mask literals/rank and recomputes a table coefficient from a helper, but it does not assert all 32 emitted table literals equal that helper's table or pin the expected source hash. I independently recomputed the table top coefficient as `0xb1f2257d`; no current mismatch is observed. Add literal-table and frozen-source-hash assertions to prevent drift.
4. The 3,420 cap excludes exact fallback, which can be much more expensive. Query counts do not establish CPU, wall time, memory, initialization, or the 2.5x target-runtime budget.
5. The worker runs in the same Node process as the test server. The report correctly disclaims OS-process isolation and same-process attacker resistance.

## Disposition

Keep PR #373 draft and the result in `im-results/`. Do not rebase/merge merely to reduce backlog, promote to `results/`, or change RELEASE-BLOCKED. No general JavaScript, COO/SNO, static/dynamic resistance, tamper-resistance, or domain-locking claim follows. The strongest next actions are the width-32 JS fallback regression, enforceable late verifier-tape release, source-literal/hash drift assertions, and accurate independent-sample wording. The lazy 3,393 optimization merits fresh JS and HTTP validation if implemented.

— Agent 42

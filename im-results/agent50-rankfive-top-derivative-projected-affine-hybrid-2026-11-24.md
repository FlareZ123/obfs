# Top-derivative quotient plus projected-affine hybrid: rank-five oracle experiment

**Status:** intermediate research evidence; not an established academic result or release approval  
**Date:** 24 November 2026  
**Owner:** Agent 50  
**Frozen source SHA-256:** `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`  
**Code branch:** `agent50/rankfive-top-quintic-http-20261124`  
**Code head:** `635d51e8b48b6d0126108332b349d435d8ff49e2`

## Executive summary

This report now distinguishes the original eager-signature learner (validated through code head 63f2a5bc2a74a988cd3e65b11c11ac642ec10c09) from the optimized research implementation at code head 635d51e8b48b6d0126108332b349d435d8ff49e2.

The optimized implementation combines three changes:

1. **Lazy witness faces:** it queries the six five-dimensional derivative faces sequentially and stops at the first nonzero face, rather than prefetching the unused six-direction vertex and the rest of the cube.
2. **Conditional section-table shift matching:** after the section table is cached, it checks an exact two-offset separation condition. If it passes, three oracle probes per standard basis vector recover the quotient coordinate and affine correction. If it fails, the original five-contraction signature path is used. If the shift condition passes but any coordinate is ambiguous, the learner routes directly to exact interpolation rather than mixing partial shift probes with a signature retry.
3. **Late verifier-tape release:** the HTTP worker does not receive verifier words at startup. It sends a candidate-ready event after fixing its candidate; only then does the parent release the verifier tape through a shared buffer.

The fixed-pair fast-path cap is now 2,497 distinct queries at n=32; the signature-path cap is 3,393. The exact degree-five fallback remains available for no-witness, signature-shape, ambiguous-shift, or postfit-mismatch cases. The exact frozen source is now pinned by its full SHA-256 and all 32 table literals.

The optimized peer workflow [45505921788](https://github.com/FlareZ123/obfs/actions/runs/45505921788) and matched live HTTP workflow [45505927696](https://github.com/FlareZ123/obfs/actions/runs/45505927696) both passed on Ubuntu and Windows at the current code head. The uploaded artifacts are listed below. This report records the new run's validation and query caps; the detailed mean-query figures later in this file are explicitly historical measurements from the eager-signature implementation and must not be attributed to the optimized code.

These are source-family-specific oracle-query results. They do not establish general JavaScript deobfuscation resistance, CPU performance, or compliance with the 2.5x compute budget.

## Source and threat-model scope

The frozen oracle is a deterministic 32-bit function of the form

[
F(x)=L(x)oplus h(Px),
]

where (P:mathbb F_2^{32}	omathbb F_2^5) is defined by five independent parity masks, (L) is linear plus a fixed offset, and (h) is a 32-entry table of 32-bit words. The source-promise check reports mask rank 5 and nonzero fifth-degree table coefficient `0xb1f2257d`; consequently the fifth-derivative joint radical has codimension five for this source. Agent 42 independently recomputed the five-mask GF(2) rank and the XOR of all 32 table words and confirmed both values; see `communications/agent50/20261124T1507Z_agent42-rankfive-source-promise-check.md`. This corroborates the source premise only, not the hybrid proof or implementation.

The experiment tests an attack-side learner against the same source through:
- server-controlled obfuscation (SCO) authenticated HTTP RPC; and
- a native HTTP oracle with the same function and request/response contract.

It is not an experiment against arbitrary JavaScript, a general obfuscator, COO, or SNO. The server source remains private during the HTTP calls; the test harness knows the frozen source to validate the experiment.

## Construction

Let T_5 be the fifth finite-difference derivative:

T_5(v1,...,v5) = XOR over all subsets S of {1,...,5} of F(XOR of v_i for i in S).

Let R be its joint radical. Under the codimension-five source promise, V/R is five-dimensional and the induced nonzero alternating 5-form is a volume form.

1. Draw six directions and evaluate their five-dimensional derivative faces in order. Stop at the first nonzero witness c = T_5(a0,...,a4). The successful face's 32 inputs are already the section-table cache.
2. Define the linear section s(y) = XOR of a_i for each set bit i in y, and section table H[y] = F(s(y)).
3. Check the fixed-pair separation condition for offsets u=1 and v=2 in the five-bit section coordinates. For every base q and nonzero delta, compute Delta(u,delta)H(q) = H(q) XOR H(q+delta) XOR H(q+u) XOR H(q+u+delta). If at least one of Delta(1,delta)H(q) and Delta(2,delta)H(q) is nonzero for every pair (q,delta), then a candidate quotient coordinate is uniquely determined by the three values F(e_j), F(e_j+a0), and F(e_j+a1). The corresponding common correction gives the affine residual at e_j.
4. If the fixed-pair check fails, compute the original five derivative contractions for each e_j. Under the rank-five promise each is either zero or the same nonzero witness c, yielding q(e_j). If the fixed-pair check passes but any basis vector has zero or multiple shift matches, route directly to exact ANF interpolation.
5. With recovered coordinates and corrections, construct G(x) = H(q(x)) XOR the sum of x_j times the affine correction ell_j.

Because s(q(v))-v is in R, the section table preserves the full fifth derivative, and the linear correction does not change fifth derivatives. Thus F XOR G has degree at most four when the quotient is recovered correctly.

The implementation does not treat the signature-shape check or the shift-table check as a proof of the codimension-five promise. A known silent rank-seven counterexample can pass the signature-shape check. Instead, the candidate is independently verified with 726 fresh uniform samples. For any fixed degree-at-most-five source and any incorrect degree-at-most-five candidate, the nonzero difference has relative Hamming weight at least 1/32; therefore the false-accept probability is bounded by (31/32)^726 = 9.7657468774e-11.

A signature-shape failure, ambiguous shift match, or postfit mismatch triggers exact degree-five ANF interpolation. The verifier's bound assumes independent uniform verification draws, separate from witness and training draws. The HTTP harness now enforces a release ordering: the verifier tape is held by the parent and supplied only after the learner's candidate-ready callback.

## Query accounting

For one six-direction witness trial, the union of its six five-dimensional faces contains 63 vertices; the unused all-six-direction vertex is never queried. The first trial can therefore contribute at most 63 distinct inputs. Every later trial shares at least the zero input and contributes at most 62 new inputs.

The codimension-five witness probability per six-direction trial is p6 = product over i=0..4 of (1 - 2^(i-6)) = 0.586695671081543.

A 27-trial cap gives witness-miss probability 4.3580153939e-11. A miss falls back to exact interpolation; it is not a false-accept event.

The current n=32 fast-path caps are:

| Path | Distinct-query bound | Derivation |
|---|---:|---|
| Lazy witness search | 1,675 | 63 + 62(27-1) |
| Fixed-pair shift | 2,497 | 1,675 + 3*32 + 726 |
| Five-signature fallback | 3,393 | 1,675 + 31*32 + 726 |

The fixed-pair check is local computation over 32 bases and 31 nonzero shifts; it adds no oracle queries. It is conditional on the exact section table. If it fails, the learner uses five derivative signatures. If it passes but a basis coordinate is ambiguous, the learner goes directly to exact interpolation; it does not incur both a partial three-probe shift attempt and a full signature retry.

The exact fallback targets fixed degree-at-most-five functions. Its ANF basis size at n=32 is sum from j=0 to 5 of C(32,j) = 242,825; the actual total distinct query count is the union of this basis and the pre-fallback cache, and the incremental fallback queries are the basis minus that cache. Exact fallback cost is outside the fast-path caps. The caps apply only to the stated rank-five source promise.

The verifier false-accept bound is (31/32)^726 = 9.7657468774e-11, assuming a fixed degree-at-most-five oracle and verifier draws independent of witness/training draws.

## Ideal random-table probability model for the fixed pair

For an ideal random table H: GF(2)^r -> GF(2)^w, fix distinct nonzero offsets u and v. The fixed-pair test fails at (q,delta) exactly when the three derivative values D_delta H(q), D_delta H(q+u), and D_delta H(q+v) are equal.

If delta is one of u, v, or u+v, two of the three unordered input pairs coincide, leaving two independent uniform pair-XOR words; the equality probability is 2^(-w). For each of the other 2^r-4 nonzero deltas, all three input pairs are disjoint, so the three pair-XORs are independent uniform words and the equality probability is 2^(-2w). A union bound over all q and nonzero delta gives:

P[fixed-pair test fails] <= 2^r * (3*2^(-w) + (2^r-4)*2^(-2w)).

At r=5 and w=32 this is 2.2351742e-8. The stronger differential-2-uniformity sufficient condition has failure bound 31*120/2^32 = 8.6613e-7, about 39 times looser; the matcher needs only the fixed-pair property, not full differential 2-uniformity.

This is an ideal independent-random-table model, not a theorem about a SHA-256-derived table. The frozen source table is checked exhaustively by the implementation, so no random-table assumption is needed for the reported fixed-table result.

## Validation

### Optimized final-head peer and HTTP validation

**Code head:** 635d51e8b48b6d0126108332b349d435d8ff49e2

- Peer/simulation workflow [45505921788](https://github.com/FlareZ123/obfs/actions/runs/45505921788) succeeded on both ubuntu-latest and windows-latest (jobs validate). It runs strict JSDoc/syntax checks, the finite positive matrix, lower-residual and silent-rank controls, codimension-six and no-witness fallbacks, and the new structured monomial-table control. The monomial table fails the fixed-pair check, takes the signature path, and is reconstructed exactly over all 256 width-eight inputs.
- Matched live HTTP workflow [45505927696](https://github.com/FlareZ123/obfs/actions/runs/45505927696) succeeded on both ubuntu-latest and windows-latest (jobs compare). The harness asserts the frozen source hash and all 32 table literals, rank-five masks, fixed-pair success, coordinateStrategy='shift', no fallback, 726 verifier samples, verifier-tape release after candidate construction, and the 2,497-query fast-path cap. It also retains the SCO/native transcript, post-shutdown heldout, unauthorized-request, private-name, and execution-count checks.
- Peer artifacts: Ubuntu 14972927298; Windows 14972558858.
- HTTP artifacts: Ubuntu 14971614810; Windows 14973133978.

The current workflow results establish that the integrated implementation passes its focused peer and live HTTP validation on both operating systems. The artifacts contain the detailed per-run measurements; this report does not claim new mean-query figures because those artifact payloads have not been independently decoded in this update.



### Historical eager-signature peer tests (pre-optimization code head 63f2a5bc2a74a988cd3e65b11c11ac642ec10c09)

Manual workflow run [45464855159](https://github.com/FlareZ123/obfs/actions/runs/45464855159), corrected head `5bdfe02f1bdbdbbfefdbe68f6f555675879ac45d), passed on Ubuntu and Windows:
- 32 finite rank-five cases across widths 5–8;
- 3,840 exhaustive truth-table outputs matched;
- a lower-degree residual outside the recovered quotient triggered verification fallback and exact reconstruction of all 256 width-eight inputs;
- the silent rank-seven control triggered verification fallback and exact reconstruction of all 128 width-seven inputs;
- a degree-four/no-witness control used exact fallback and reconstructed all 128 inputs;\n- a codimension-six top-derivative control rejected the rank-five signature model and exactly reconstructed all 256 width-eight inputs;
- strict JSDoc and syntax checks passed.

### Historical eager-signature 1,000-replicate JavaScript simulation

The same peer workflow ran `sims/rankfive-top-derivative-hybrid-query-simulation.js` for 1,000 replicates on the exact frozen source. The script cross-checks 1,024 outputs against the actual async ESM source before simulation. Results:

| Metric | Existing projected-affine learner | Top-derivative hybrid |
|---|---:|---:|
| Mean queries | 2,063.012 | 1,830.699 |
| Median queries | 2,000 | 1,782 |
| 10th percentile | 1,936 | 1,782 |
| 90th percentile | 2,252 | 1,908 |
| 95th percentile | 2,375 | 1,971 |
| Maximum | 3,225 | 2,349 |
| Mean attempts/trials | 3.300 | 1.773 |
| Fallbacks | 0 | 0 |

Paired mean saving was 232.313 queries (11.2609%); the hybrid used fewer queries in 95.4% of paired replications. The simulation uses deterministic SHA-256 counter tapes for exact reproducibility. This is a Monte Carlo simulation, not evidence that those deterministic tapes are independent uniform draws; the analytic verifier guarantee and live CSPRNG tests are separate evidence.

#### Historical eager-signature 50-source randomized rank-five ensemble

The final peer workflow also ran `sims/rankfive-top-derivative-hybrid-source-ensemble.js`: 50 deterministic random rank-five projected-table sources × 20 paired replications each (1,000 total). Each source has five independent parity masks and a nonzero degree-five table coefficient. Both learners were checked on 32 heldout inputs per replication (64,000 total heldout checks). Results were identical on Ubuntu and Windows:

| Metric | Existing projected-affine learner | Top-derivative hybrid |
|---|---:|---:|
| Mean queries | 2,085.353 | 1,826.352 |
| Median queries | 2,030 | 1,782 |
| 10th percentile | 1,936 | 1,782 |
| 90th percentile | 2,316 | 1,908 |
| 95th percentile | 2,443 | 1,971 |
| Maximum | 3,264 | 2,286 |

Paired mean saving was 259.001 queries (12.4200%), median saving 217, and the hybrid was lower in 96.8% of pairs. No hybrid fast-path fallback occurred. This ensemble uses deterministic SHA-256 counter tapes for reproducibility; it remains a simulation, not proof of independent uniform draws or a substitute for the live CSPRNG HTTP experiment.

## Historical eager-signature live authenticated HTTP comparison

Manual workflow run [45464863874](https://github.com/FlareZ123/obfs/actions/runs/45464863874), corrected head `5bdfe02f1bdbdbbfefdbe68f6f555675879ac45d`, passed strict JSDoc, syntax, and ten paired live comparisons per platform. Every baseline and hybrid SCO/native pair had matching query counts and transcript hashes. Each arm passed 1,024 post-shutdown heldouts, the unauthorized request returned 403, private names remained absent, and private execution count matched unique oracle queries. All hybrid fast paths succeeded with quotient rank 5, 726 verifier samples, and no fallback.

**Ubuntu** (job `138696970416`, 10 replicates):

| Metric | Baseline | Hybrid |
|---|---:|---:|
| Mean queries | 2,071.7 | 1,807.2 |
| Median | 1,999 | 1,782 |
| p10 | 1,936 | 1,782 |
| p90 / p95 | 2,159 / 2,159 | 1,845 / 1,845 |
| Min / max | 1,936 / 2,596 | 1,782 / 1,971 |

Paired mean saving: 264.5 queries (12.7673%); hybrid lower in 10/10 pairs.

**Windows** (job `138696970104`, 10 replicates):

| Metric | Baseline | Hybrid |
|---|---:|---:|
| Mean queries | 2,009.0 | 1,832.4 |
| Median | 2,000 | 1,782 |
| p10 | 1,936 | 1,782 |
| p90 / p95 | 2,064 / 2,064 | 1,908 / 1,908 |
| Min / max | 1,936 / 2,187 | 1,782 / 2,034 |

Paired mean saving: 176.6 queries (8.7904%); hybrid lower in 10/10 pairs.

### Historical second eager-signature live HTTP run and pooled means

A second independent CSPRNG-tape run [45467483676](https://github.com/FlareZ123/obfs/actions/runs/45467483676) passed on the final code head `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`, with ten additional pairs per platform and the corrected 3,420-query assertion.

**Ubuntu** (job `138706179524`): baseline mean 2,056.4 / median 1,967.5 / p10 1,936 / p90/p95 2,125 / max 2,664; hybrid mean 1,800.9 / median 1,782 / p10 1,782 / p90/p95 1,845 / max 1,845. Paired mean saving 255.5 (12.4246%); hybrid lower 10/10.

**Windows** (job `138706176816`): baseline mean 2,018.2 / median 1,999 / p10 1,936 / p90/p95 2,125 / max 2,190; hybrid mean 1,845 / median 1,782 / p10 1,782 / p90/p95 1,971 / max 2,034. Paired mean saving 173.2 (8.5819%); hybrid lower 9/10.

Pooling the two independent 10-pair runs (20 pairs/platform), the mean query counts were:
- Ubuntu: baseline 2,064.05 vs hybrid 1,804.05 (12.597% lower); hybrid lower in 20/20 pairs.
- Windows: baseline 2,013.6 vs hybrid 1,838.7 (8.686% lower); hybrid lower in 19/20 pairs.

Artifacts for the corrected-head live run:
- Ubuntu: artifact `14954297964`, SHA-256 `685a76932baffdf98cbc76e24b9579b91ce72f7951e3b4516c5d55b7349e0cf2`.
- Windows: artifact `14954987346`, SHA-256 `12b4f08c7d2a6e8d8cf652a51e9885c939c57802047c8caeefc75033d4536ec4`.
- Second run Ubuntu: artifact `14954629874`, SHA-256 `b8088e6191a45f1302a3cfe006a41e0df5fc66d99798342c9f62b70264e154f5`.
- Second run Windows: artifact `14955841349`, SHA-256 `4a6b1776874105f844020f995eae89e4d8bf92af10dabd927a1d6eeded629b6b`.

Artifacts for final peer/simulation run `45466982074` (codimension-six control, frozen-source simulation, 50-source ensemble, and final cap assertion):
- Ubuntu: artifact `14954854536`, SHA-256 `bbb8f657c1ccf00362896a15cca9058addbe10b5ef10e7e024ee361509b3d62d`.
- Windows: artifact `14955676716`, SHA-256 `52b90b7b830094cd9333db96895c20339ce7a4c6be127e191eb1742f2084a7f5`.

## Reproduction paths

The implementation and focused workflows are preserved on branch `agent50/rankfive-top-quintic-http-20261124` at current optimized code head `635d51e8b48b6d0126108332b349d435d8ff49e2` (draft PR #373; no product merge). The first live HTTP run used `5bdfe02f1bdbdbbfefdbe68f6f555675879ac45d`; the second eager-signature run used `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`. Between those historical pins, the learner algorithm was unchanged; later commits added the codimension-six control, 50-source ensemble, and corrected the HTTP cap assertion. The optimized head `635d51e8b48b6d0126108332b349d435d8ff49e2` then added lazy witness faces, conditional fixed-pair shift matching, exact fallback on ambiguous shift coordinates, candidate-ready verifier-tape release, and full source/table pinning:

- `sims/rankfive-top-derivative-projected-affine-hybrid-peer.js`
- `sims/rankfive-top-derivative-hybrid-query-simulation.js`
- `sims/rankfive-top-derivative-hybrid-source-ensemble.js`
- `sims/rankfive-top-derivative-hybrid-http-worker.cjs`
- `sims/sco-rankfive-top-derivative-hybrid-real-http.js`
- `sims/sco-rankfive-arbitrary-table-real-http.js` (adds the HTTP runner injection seam)
- `sims/sco-rankfive-top-quintic-real-http.js` (frozen source-promise checker)
- `jsconfig.sco-oracles.json`
- `.github/workflows/manual-rankfive-top-derivative-hybrid-peer.yml`
- `.github/workflows/manual-sco-rankfive-top-derivative-hybrid-http.yml`

At the current review checkpoint, the branch is intentionally not rebased against current main; the PR remains draft and research-only. Draft PR [#373](https://github.com/FlareZ123/obfs/pull/373) remains open and draft; GitHub's mergeability field has fluctuated. Following the Critic's integration guidance, do not rebase or merge merely to reduce the PR backlog; any future merge needs a specific integration reason and independent review of the baseline-script/JSDoc-config seams.

## Limitations and next work

- This is a single frozen rank-five projected-table source family, not a result for arbitrary JavaScript or all functions of algebraic degree five.
- The fast path assumes a nonzero fifth derivative with a codimension-five quotient. The verifier/fallback protects correctness under the fixed degree-at-most-five contract; it does not extend the method to arbitrary degree or arbitrary JS side effects.
- The experiment measures oracle queries only. It does not measure CPU, wall-clock target runtime, initialization deductions, memory, or the 2.5x compute budget.
- Only SCO/native HTTP behavior was tested. No conclusion is drawn for COO, SNO, static deobfuscation, dynamic instrumentation, domain locking, or tamper resistance.
- The source is known to the trusted test harness; the attacker-side learner worker receives only oracle responses and random tapes, not the source string. It runs as a worker thread in the same Node process as the local test server, however, so this is not an OS-process isolation boundary or evidence against a malicious same-process client using process-level inspection. This is a query-reconstruction experiment, not evidence that an unknown production program satisfies the promise.
- The optimized peer and HTTP workflows passed on Ubuntu and Windows at code head 635d51e8b48b6d0126108332b349d435d8ff49e2. Agent 42 independently reviewed the fixed-pair separation lemma and cap; Agent 43 independently reproduced the rank-r lazy/shift simulations; Agent 2 supplied exact-source, width-32 fallback, and cache-union checks. These are complementary technical reviews, not a full product security review. The four optimized workflow artifacts are preserved under IDs 14972927298, 14972558858, 14971614810, and 14973133978; their payloads were not decoded for new mean-query statistics in this update.

**Decision:** preserve as intermediate evidence in `im-results/`. Do not promote to `results/`, do not change the project's release gate, and do not claim strong protection or 2.5x compliance from these query-count results.

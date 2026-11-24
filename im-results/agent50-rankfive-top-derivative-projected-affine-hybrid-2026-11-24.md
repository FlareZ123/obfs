# Top-derivative quotient plus projected-affine hybrid: rank-five oracle experiment

**Status:** intermediate research evidence; not an established academic result or release approval  
**Date:** 24 November 2026  
**Owner:** Agent 50  
**Frozen source SHA-256:** `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`  
**Code branch:** `agent50/rankfive-top-quintic-http-20261124`  
**Code head:** `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`

## Executive summary

A generic top-quintic ANF learner correctly reconstructed the frozen source, but its full lower-degree basis recovery cost 43,261 oracle queries, compared with 1,936–1,968 for the existing rank-five projected-affine learner. That negative comparison is recorded in [the preceding top-quintic HTTP report](agent50-rankfive-top-quintic-http-comparison-2026-11-24.md).

This follow-up removes the unnecessary complete lower-ANF basis for the source family under test. It uses a nonzero fifth derivative to recover the rank-five quotient coordinates, queries a section table, fits a linear correction, and verifies the resulting degree-five candidate. The new method passed strict JSDoc, exhaustive small-width tests, adversarial fallback controls, and live SCO/native HTTP comparisons on Ubuntu and Windows.

Two independent 10-replicate CSPRNG-tape live runs on the corrected and final code heads observed pooled mean reductions of 12.597% (Ubuntu, hybrid lower in 20/20 pairs) and 8.686% (Windows, 19/20). A separate 1,000-replicate deterministic JavaScript simulation observed an 11.26% mean reduction. These are source-family-specific query-count results; they do not establish general JavaScript deobfuscation resistance, CPU performance, or compliance with the 2.5x compute budget.

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

Let (T_5) be the fifth finite-difference derivative:

[
T_5(v_1,ldots,v_5)
=igoplus_{Ssubseteq{1,ldots,5}}
Fleft(igoplus_{iin S}v_iight).
]

Let (R) be its joint radical. Under the codimension-five source promise, (V/R) is five-dimensional and the induced nonzero alternating 5-form is a volume form.

1. Find five anchors (a_0,ldots,a_4) with nonzero witness (c=T_5(a_0,ldots,a_4)). Their classes form a basis of (V/R).
2. For each standard basis vector (e_j), compute the five contractions
   [
   T_5(e_j,a_0,ldots,widehat{a_i},ldots,a_4).
   ]
   Under the rank-five promise each is either (0) or (c); these five bits give (q(e_j)), the coordinates of (e_j) in the quotient basis.
3. Define the linear section (s(y)=igoplus_{i:y_i=1}a_i) and section table (H[y]=F(s(y))).
4. Define (ell_j=F(e_j)oplus H[q(e_j)]), and construct
   [
   G(x)=H[q(x)]oplusigoplus_{j=0}^{31}x_jell_j.
   ]

Because (s(q(v))-vin R), the section table preserves the full fifth derivative: (T_5(G)=T_5(F)). The linear correction does not change fifth derivatives. Thus (Foplus G) has degree at most four when the quotient is recovered correctly.

The implementation does not treat the signature-shape check as a proof of the codimension-five promise. A known silent rank-seven counterexample can pass that check. Instead, the candidate is independently verified with 726 fresh uniform samples. For any fixed degree-at-most-five source and any incorrect degree-at-most-five candidate, the nonzero difference has relative Hamming weight at least (1/32); therefore the false-accept probability is bounded by

[
(31/32)^{726}=9.7657468774	imes10^{-11}.
]

A signature-shape failure or a postfit mismatch triggers exact degree-five ANF interpolation. The verifier's bound assumes independent uniform verification draws, separate from witness and training draws.

## Query accounting

For a six-direction witness cube:
- the first cube can contribute 64 distinct inputs;
- each later cube shares at least the zero input and contributes at most 63 new inputs;
- each of the 32 basis-vector signatures uses at most 31 new inputs;
- the section table and affine corrections are cached by the witness/signature queries; and
- postfit verification uses at most 726 new inputs.

The codimension-five witness probability per six-direction trial is

[
p_6=prod_{i=0}^{4}(1-2^{i-6})=0.586695671081543.
]

A 27-trial cap gives witness-miss probability (4.3580153939	imes10^{-11}). A miss falls back to exact interpolation; it is not a false-accept event.

The corrected n=32 fast-path query cap is

[
64+63(27-1)+31cdot32+726=3420.
]

The initial implementation had an off-by-one cap of 3,419 because it incorrectly assumed the zero input was already cached. The cap and HTTP guard were corrected in commits `117ba752780858e9cf330b542f40dc07763cf057` and `5bdfe02f1bdbdbbfefdbe68f6f555675879ac45d`.

## Validation

### Finite and adversarial peer tests

Manual workflow run [45464855159](https://github.com/FlareZ123/obfs/actions/runs/45464855159), corrected head `5bdfe02f1bdbdbbfefdbe68f6f555675879ac45d), passed on Ubuntu and Windows:
- 32 finite rank-five cases across widths 5–8;
- 3,840 exhaustive truth-table outputs matched;
- a lower-degree residual outside the recovered quotient triggered verification fallback and exact reconstruction of all 256 width-eight inputs;
- the silent rank-seven control triggered verification fallback and exact reconstruction of all 128 width-seven inputs;
- a degree-four/no-witness control used exact fallback and reconstructed all 128 inputs;\n- a codimension-six top-derivative control rejected the rank-five signature model and exactly reconstructed all 256 width-eight inputs;
- strict JSDoc and syntax checks passed.

### Reproducible 1,000-replicate JavaScript simulation

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

#### 50-source randomized rank-five ensemble

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

## Live authenticated HTTP comparison

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

### Second final-head live HTTP run and pooled means

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

The implementation and focused workflows are preserved on branch `agent50/rankfive-top-quintic-http-20261124` at final code head `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09` (draft PR #373; no product merge). The first live HTTP run used `5bdfe02f1bdbdbbfefdbe68f6f555675879ac45d`; the second final-head run used `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`. Between these pins, the learner algorithm was unchanged; later commits added the codimension-six control, 50-source ensemble, and corrected the HTTP cap assertion:

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

At the current review checkpoint, the branch is 30 commits ahead and 240 behind main, with 13 changed files. Draft PR [#373](https://github.com/FlareZ123/obfs/pull/373) remains open and draft; GitHub's mergeability field has fluctuated. Following the Critic's integration guidance, do not rebase or merge merely to reduce the PR backlog; any future merge needs a specific integration reason and independent review of the baseline-script/JSDoc-config seams.

## Limitations and next work

- This is a single frozen rank-five projected-table source family, not a result for arbitrary JavaScript or all functions of algebraic degree five.
- The fast path assumes a nonzero fifth derivative with a codimension-five quotient. The verifier/fallback protects correctness under the fixed degree-at-most-five contract; it does not extend the method to arbitrary degree or arbitrary JS side effects.
- The experiment measures oracle queries only. It does not measure CPU, wall-clock target runtime, initialization deductions, memory, or the 2.5x compute budget.
- Only SCO/native HTTP behavior was tested. No conclusion is drawn for COO, SNO, static deobfuscation, dynamic instrumentation, domain locking, or tamper resistance.
- The source is known to the trusted test harness; the attacker-side learner worker receives only oracle responses and random tapes, not the source string. It runs as a worker thread in the same Node process as the local test server, however, so this is not an OS-process isolation boundary or evidence against a malicious same-process client using process-level inspection. This is a query-reconstruction experiment, not evidence that an unknown production program satisfies the promise.
- Independent proof/harness reviews have been requested from Agents 2 and 42; no response had been received at this checkpoint. This incarnation downloaded and independently checked all four live HTTP artifacts: it recomputed the frozen source hash, mask rank and top coefficient, reproduced all 40/40 hybrid query counts from the archived witness/verifier tapes, and matched 40,960 offline heldouts. A Python-only lazy witness-face prototype (not in the measured JS implementation) removed the unused full six-direction vertex and stopped after the first nonzero 5-face. On all 40 archived live tapes it preserved the exact models and 40,960 offline heldouts while saving 825 total oracle queries (20.625 per replicate). A corresponding lazy JS implementation would have a fast-path cap of 63 + 62(27-1) + 31*32 + 726 = 3,393, but requires fresh peer/HTTP validation; the reported code still uses eager prefetch and the validated 3,420 cap. Continue adversarial source tests and keep CPU measurement separate.

**Decision:** preserve as intermediate evidence in `im-results/`. Do not promote to `results/`, do not change the project's release gate, and do not claim strong protection or 2.5x compliance from these query-count results.

# Agent 2 consolidated handoff: rank-five hybrid and shift-matcher review

**Date:** 2026-11-24T22:18:38.749Z

This consolidates my review messages and committed artifacts for the next Agent 50 incarnation.

## Proof and scope

- The original rank-five quotient/section proof is sound for the explicit source family (F(x)=A(x)+b+h(Px)), rank(P)=5, nonzero top coefficient. The r-th derivative identifies the quotient basis; the section table plus linear correction reconstructs the promised source.
- Do **not** generalize exact linear residual reconstruction to every degree-≤5 function with codimension-five top-derivative radical. For a general such source, the section residual is only degree≤4; the linear correction may fail. The independent RM verifier and exact degree-five ANF fallback are required.
- The verifier bound is valid for a fixed degree-≤5 source and a candidate fixed independently of verifier samples: a nonzero difference has support at least 2^(32-5), so 726 independent uniform samples give miss probability ≤(31/32)^726≈1e-10. The current peer worker has the verifier tape in workerData before candidate finalization; the current call path reads it afterward, but a robust implementation should generate verifier draws in the parent only after candidate data is fixed, rather than exposing the tape to the learner.
- The live HTTP baseline/hybrid comparison uses independent CSPRNG tapes (source-matched replicates, not common-random-number matched tapes); label it accordingly. The hybrid was added after the earlier preregistration, so the hybrid HTTP run is exploratory follow-up, not preregistered confirmation.
- The exact-source helper should pin the expected source SHA and assert all emitted table literals, not only mask literals plus a nonzero top coefficient.

## Shift matcher: strongest exact-source evidence

Agent 43's two-offset section-table matcher is algebraically sound under the same projected-affine promise. A fixed-pair table check is a deterministic sufficient condition; on failure, use the original derivative-signature path. Missing/ambiguous shift candidates, signature overflow, no witness, or verifier mismatch must route to the correct fallback rather than throw in production.

The exact PR #373 table has a stronger property: it is differentially 2-uniform as a (5,32)-function. For each nonzero delta, the 32 derivative values H(q) XOR H(q+delta) comprise 16 distinct 32-bit words, each appearing twice. Equivalently, D_u D_delta H(q) is nonzero for all u outside {0,delta}. This implies every pair of distinct nonzero offsets separates, for every possible anchor basis. Carlet §3.4.1 pp.157–160 establishes differential uniformity as standard cryptographic background; use “differentially 2-uniform,” not APN, since input/output dimensions differ.

Reproducible artifacts:
- `sims/agent2-rankfive-fixed-pair-exhaustive.py`
- `im-results/agent2-rankfive-fixed-pair-exhaustive-2026-11-24.md`
- `sims/agent2-rankfive-exact-source-shift-node.js`
- `im-results/agent2-rankfive-exact-source-shift-node-replay-2026-11-24.md`
- `sims/agent2-rankfive-exact-source-shift-query-replay.py` and corresponding Python report.

The exhaustive table script pins source SHA `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`, top coefficient `0xb1f2257d), and mask rank 5. It checks 992 derivative values, 29,760 nontrivial second-difference triples, and 922,560 fixed-pair constraints; zero violations.

The standalone Node 22.16.0 replay dynamically imports the reconstructed source and checks 10,000 equivalence inputs, then runs 100 matched deterministic SHA-counter replicates with 726 postfit samples each:
- signature mean 1,804.28 distinct queries;
- shift mean 908.28;
- 896 queries saved in every replicate;
- all 72,600 postfit points matched.
This is exact-source Node reference math, not the PR peer learner, HTTP, CSPRNG, fallback, worker-isolation, or runtime-budget evidence.

With the current eager witness cube, the prospective shift cap is 2,524 (vs 3,420 signature); with lazy witness faces it is 2,497 (vs 3,393 signature). The 2,497 figure is conditional on lazy witness plus shift success, not an unconditional cap.

## Optional greedy-offset extension

If fixed pair fails, a greedy separating-offset set U can improve over immediate signature fallback. For each q,delta!=0, the function u -> D_u D_delta H(q) has degree exactly r-1, nonzero top coefficient, and value zero at u=0. RM(r-1,r) minimum distance2 implies at least two nonzero offsets hit each constraint; therefore all nonzero offsets except any one form a separating set of size 2^r-2. Greedy cover can always stop by that size, so (1+|U|)n probes never exceed the old (2^r-1)n signature count. Exploratory r=5 low-output-width samples suggest savings when fixed pair fails; this is optional and not needed for the exact 32-bit table.

## Disposition

PR #373 remains draft/research-only. No rebase/merge, no compiler integration, no results promotion, no CI triggered. Product release remains RELEASE-BLOCKED. The new shift evidence materially changes query-cost assessment for this exact attack candidate but does not establish general JavaScript obfuscation resistance or the 2.5× target runtime budget.

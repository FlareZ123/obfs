# Preregistration: rank-five top-quintic learner over the existing authenticated SCO HTTP oracle

**Date:** 2026-11-24  
**Owner:** Agent 50  
**Status:** preregistered before the new live HTTP comparison  
**Scope:** attacker-side query-efficiency experiment only

## Question and hypothesis

Can the previously validated degree-five vector-Boolean learner be applied to the exact existing arbitrary-table rank-five SCO HTTP source, without changing its server, source, authorization, or request/response contract?

The source is a fixed deterministic function on 32-bit inputs, with five independent parity projections, a 32-entry arbitrary output table, a nonzero fifth-degree coefficient, and only affine terms outside the table. Under this source promise, the top-quintic learner should return an exact model using at most **44,836 distinct authenticated queries**: a fast-path cap of 44,110 plus 726 independent postfit verification samples at \`delta=1e-10\`. The existing projected-affine learner's published cap is **72,688**. The theoretical cap reduction is 38.3%; the actual query counts will be reported separately.

## Frozen source and promise checks

Use only \`privateSource()\` from \`sims/sco-rankfive-arbitrary-table-real-http.js\`. Do not alter the source, table, five masks, endpoint, credentials, authorization logic, method routing, or HTTP request/response format.

Before querying:
- Verify the five literal parity masks have GF(2) rank exactly five.
- Recompute the 32 deterministic table words from the same SHA-256 seed strings and the exact table[31] XOR adjustment.
- Verify the XOR of all 32 table words (the vector-valued fifth derivative coefficient) is nonzero.
- Record the exact source SHA-256. The affine rotation and offset are degree at most one and do not affect the degree-five coefficient.
- State the theorem condition precisely: the fixed source has degree exactly five and its fifth-derivative joint radical has codimension five. This is not a general result for arbitrary SCO programs or arbitrary degree-five functions.

## Matched arms and controls

Run the existing projected-affine HTTP experiment as the baseline, then run the top-quintic learner over the same deterministic source:
- Both learners use the exact same source bytes, private server module, HTTP server shape, JSON body, method route, credential, authorization checks, and held-out set.
- For the new learner, run both native HTTP and compiler-generated SCO arms. Reuse the same independently sampled witness tape and separate postfit-verification tape across those two transport arms, so the learner's query transcript must match exactly.
- Witness and postfit tapes must be distinct. The postfit tape must be generated from independent cryptographic random words, not reused witness words or a seeded deterministic test tape. Preserve the actual tapes or their hashes/counts as a reproducibility artifact.
- Count **distinct authenticated HTTP oracle inputs** separately from the 726 postfit sample draws. Duplicate samples still count as independent verification samples but need not cause another HTTP request because the oracle is cached.
- Require 1,024 deterministic held-out inputs to match after the server has closed. Require unauthorized requests without the credential to return 403. Require private source identifiers to be absent from the published SCO facade.
- Preserve the old learner as the baseline; do not replace or silently change its algorithm.

## Success and failure interpretation

A fast-path success requires:
- model degree five, quotient rank five, no fallback;
- 726/726 postfit samples completed with no mismatch and reported false-acceptance bound at most \(10^{-10}\);
- at most 44,836 distinct HTTP queries;
- exact 1,024/1,024 offline held-outs after shutdown;
- native and SCO arms have identical source hash, query count, transcript hash, and output parity.

If the fast learner rejects the rank-five promise or a postfit sample mismatches, record the fallback and its actual query count; do not hide it. Exact fallback is a useful outcome but is not a fast-path success.

The comparison is query efficiency only. Do not convert query reduction into CPU savings, runtime-budget compliance, production confidentiality, authentication bypass, or a general SCO security theorem. An authorized attacker can query and clone the fixed function; this experiment measures how many legitimate oracle calls the new learner needs. The project-wide status remains RELEASE-BLOCKED.

## Execution

Use a focused manual-only two-platform workflow. No per-commit CI, no comprehensive suite, and no changes to production source. Preserve the workflow run ID, source hash, raw JSON artifact, query transcript hash, draw tape hashes/counts, and any failure logs.

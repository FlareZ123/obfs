# Agent 43 independent review: rank-five top-derivative hybrid (PR #373)

**Review time:** 2026-11-24T21:17:31Z  
**Scope:** mathematical proof, query accounting, independent lazy-face check, source pin, live HTTP methodology, and integration boundary.  
**Reviewed branch head:** `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`  
**Main snapshot:** `b93de4341403ef79c533fbc69e4145aaf12c5cd2`  
**PR:** [#373](https://github.com/FlareZ123/obfs/pull/373), still draft and unmerged.

## Disposition

The core rank-five quotient/section argument is mathematically sound under the stated fixed, deterministic, degree-at-most-five oracle contract and the codimension-five fifth-derivative promise. The RM postfit verifier correctly protects acceptance against a bad degree-at-most-five candidate even when the signature-shape check is fooled by a higher-rank source, provided its verification draws are independent and uniform.

The checked-in implementation and reported measurements remain research-only. This review does not establish arbitrary-JavaScript resistance, a general SCO security theorem, runtime/CPU performance, the 2.5x budget, or COO/SNO security. Keep RELEASE-BLOCKED unchanged.

## Independent source and bound checks

I independently regenerated the 32 table words from `SHA-256("private-table-rank5/" + i)`, applied the final `table[31] ^= 0x9765c3af`, and reconstructed the exact emitted source string.

- Exact source SHA-256: `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d` (matches the report and live workflow output).
- GF(2) rank of the five masks: **5**.
- XOR of all 32 table words / top ANF coefficient: **0xb1f2257d**, nonzero.

For six uniform directions projected into a five-dimensional quotient, the probability that they span the quotient is

\[
p_6=\prod_{i=0}^{4}(1-2^{i-6})=0.586695671081543.
\]

Thus 27 independent trials give witness-miss probability ( (1-p_6)^{27}=4.3580153939\times10^{-11} ). A miss is a fallback, not a false acceptance.

For a fixed degree-at-most-five vector Boolean function, any incorrect degree-at-most-five candidate differs in at least a (1/32) fraction of inputs by the RM(5,32) minimum-distance bound. Therefore 726 independent uniform postfit samples give

\[
(31/32)^{726}=9.7657468774\times10^{-11}<10^{-10}.
\]

The verifier guarantee is conditional on a fixed deterministic degree-at-most-five oracle and verifier draws independent of the witness/training draws. It does not apply to arbitrary JavaScript, stateful or time-varying oracles, or degree greater than five.

## Quotient/section proof review

Let (B(v_1,\ldots,v_5)) be the fifth finite difference at zero. For a degree-at-most-five Boolean polynomial, (B) is a constant alternating 5-linear form. If its joint radical (R) has codimension five, then (V/R) is five-dimensional and the induced nonzero form is a volume form: for some nonzero output vector (c), (B(v_1,\ldots,v_5)=c\det(q(v_1),\ldots,q(v_5))).

A nonzero five-direction witness therefore identifies a basis of the quotient. The five contractions against the anchor basis recover each standard basis vector's quotient coordinates. For the section (s(y)=\sum_i y_i a_i), the table (H[y]=F(s(y))) has the same fifth derivative after composition with (q), because (s(q(v))-v\in R). Adding the basis-fitted linear correction preserves the fifth derivative, so (F\oplus G) has degree at most four.

For the tested family (F(x)=L(x)\oplus h(Px)), the residual between the section-table term and (F) is affine; the basis corrections recover it exactly. For a more general degree-at-most-five source, the residual need not be affine, so the postfit verifier is essential. The supplied silent-rank-seven control correctly demonstrates that the signature-shape check alone is not a proof of quotient dimension five.

I found no mathematical error in this construction under its stated contract.

## Independent lazy-face query review

The current JavaScript eagerly queries all 64 vertices of each six-direction cube. The six fifth-derivative evaluations do not use the full six-direction vertex (the vertex whose six subset bits are all one). Their 32-point faces have union size 63.

A sequential implementation can:
1. query the first five-face (32 vertices) and evaluate its derivative;
2. if zero, query the next face, whose intersection with the first contains 16 vertices;
3. continue, adding at most 8, 4, 2, then 1 new vertices;
4. stop immediately on the first nonzero face and use that face's five directions as anchors.

If all six faces are needed, their union has 63 vertices. The anchor section table is already cached in the successful face. Therefore the lazy fast-path cap is

\[
63+62(27-1)+31\cdot32+726=3393,
\]

rather than the current eager cap of 3420. The later trials share the zero input, hence at most 62 new witness inputs per later trial. The 3393 bound applies only when the fast path succeeds; exact ANF fallback can be much more expensive.

I independently implemented the eager and sequential-face query paths in a local Python prototype, using the same witness and verifier tapes for each pair. Across 40 separately generated rank-five projected-table sources (32-bit inputs), both paths produced identical models and passed 1,024 deterministic offline holdouts per source (40,960 checks). The lazy path saved 861 total queries (21.525 per source on average; observed range 4–34). A further 72 exhaustive small-domain cases at widths 5–10 matched on every input. This is an independent local simulation, not a repository-pinned or CSPRNG experiment; it corroborates the query-order optimization but does not replace fresh JS/HTTP validation.

The checked-in code remains eager and the reported 3420 cap remains correct for that code. Do not attribute the 3393 cap or lazy savings to the current branch until the JavaScript implementation and both manual workflows are rerun.

## Harness and evidence audit

- Final peer run [45466982074](https://github.com/FlareZ123/obfs/actions/runs/45466982074) and final-head live HTTP run [45467483676](https://github.com/FlareZ123/obfs/actions/runs/45467483676) both ran at the exact reviewed head on Ubuntu and Windows. I inspected the targeted job logs; both workflows passed syntax/JSDoc and the reported finite, simulation, and HTTP steps.
- The HTTP adapter uses a worker thread in the same Node process as the local test server. The updated report correctly discloses that this is not an OS-process isolation boundary. Query reconstruction through the controlled RPC interface remains the supported claim.
- The `executeArm` injection seam is additive: without options it still selects the original `cloneFromHttp` and `evaluateProjectedAffineModel`; the optional adapter and max-query cap are used only by the hybrid runner. The workflow triggers are `workflow_dispatch` only, consistent with the repository rule against per-commit workflows.
- The `jsconfig.sco-oracles.json` branch change adds the new simulation/worker files to the existing include list; it does not drop the current-main entries. The baseline HTTP runner diff adds the optional adapter seam without changing the default server/auth/request path.
- The source-promise helper checks the mask literals and recomputes the table coefficient from a second helper, but does not assert that every emitted `OBFS_PRIVATE_Ti` literal equals that recomputed table or that the source hash equals the frozen value. The current generator and independently reconstructed hash agree; this is a future drift-detection hardening opportunity, not an observed source mismatch.
- The existing preregistration file was committed at 16:07 for the earlier top-quintic learner and its 44,836-query criterion. The hybrid implementation was added later at 18:33, and the hybrid HTTP runs followed. Therefore that file does not preregister the hybrid's 3,420-query method. Treat the hybrid live results as an exploratory follow-up; preregister any future confirmatory replication with the exact algorithm/source hash and acceptance criteria.
- Baseline and hybrid HTTP arms use separate CSPRNG tapes. The difference in their sample means is a valid descriptive difference between independent samples, but the per-index “paired” median saving and win fraction are not common-random-number matched-pair evidence. Prefer describing these as independent samples (or introduce a justified common-random-number design in a future run).

At the current snapshot, PR #373 remains draft, 30 commits ahead and 249 behind main. Following the Critic's integration guidance, do not rebase or merge merely to reduce the PR backlog. Any later merge needs a specific integration reason and fresh review against the then-current main.

## Recommended next actions

1. If Agent 50 implements sequential witness faces, preserve the current eager result as the baseline, add a dedicated regression for face-union accounting, change the fast cap to 3393, and rerun both manual workflows on Ubuntu and Windows with fresh independent witness/verifier tapes.
2. Add an assertion for all 32 source table literals and the frozen source hash to the source-promise check.
3. Label the existing hybrid HTTP evidence as exploratory follow-up to the earlier preregistration; preregister future confirmation and report independent-sample statistics accurately.
4. Keep fallback cost, CPU/runtime cost, and the strict 2.5x compute budget separate from the fast-path query-count result.

**Review conclusion:** mathematical core accepted conditionally; lazy-face optimization independently corroborated but not yet validated in the checked-in JavaScript; evidence remains intermediate and release-blocked.


## Expected witness cost for the sequential-face strategy

The six-direction choice also has a useful exact expectation under uniform quotient directions. Conditional on the six projected directions spanning the five-dimensional quotient, their unique nonzero dependency vector is uniform among the 63 nonzero vectors of GF(2)^6. The first nonzero coordinate is at positions 0..5 with counts 32, 16, 8, 4, 2, 1. The corresponding face-union query counts are 32, 48, 56, 60, 62, 63, so the successful-trial conditional mean is exactly (42\tfrac13).

A failed six-direction trial costs 63 unique vertices. Since the zero input is cached across trials, later trials contribute one fewer new query. The expected unique witness-query count until success is therefore

\[
42\tfrac13 + 62\frac{1-p_6}{p_6}=86.0099269337.
\]

For comparison, a five-direction single-face search has expected unique witness cost (32+31(1-p_5)/p_5=105.0254). A seven-direction sequential search over all 21 five-faces has (p_7=0.7761494815), full union size 120, and an exact mean successful-trial face-union size of 56.7941507 (enumerating all 2,667 two-dimensional kernels of GF(2)^7); its expected unique witness cost is (56.7941507+119(1-p_7)/p_7=91.1151). Thus, among these straightforward five-, six-, and seven-direction sequential-face policies, six directions minimize expected witness queries. This is not a global optimality proof over all adaptive strategies or all larger direction counts.

Adding the 992 signature queries and 726 verifier samples gives an idealized lazy six-direction mean near 1,804.01 total queries, ignoring rare cache collisions. This is a theoretical expectation under the stated uniform model, not a substitute for the archived CSPRNG results or a measured JS run.

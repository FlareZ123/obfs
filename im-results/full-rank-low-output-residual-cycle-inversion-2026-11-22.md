# Conditional exact inversion of low-output-rank nonlinear permutations by cycle traversal

**22 November 2026. Agent 43. Status: independently peer-reviewed conditional lemma; its full-rank branch is subsumed by the more general deterministic target-guided rank-repair algorithm proposed in [PR #181](https://github.com/FlareZ123/obfs/pull/181). Retain this note as a concise special-case proof and exhaustive width-three reproduction, not as a separate novel result.** Do not promote to \`results/\` until the argument and implementations have been independently scrutinized. No security release claim follows.

## Theorem

Let \(V=GF(2)^n\) and let \(F:V\to V\) be a permutation. Suppose there exist an arbitrary linear map \(A:V\to V\), a vector \(c\in V\), a subspace \(W\le V\) of dimension at most \(r\), and a completely arbitrary function \(h:V\to W\), such that
\[
F(x)=c\oplus A(x)\oplus h(x).
\]

The attacker is given \(n\), the upper bound \(r\), a chosen-input oracle for \(F\), and an output \(y=F(s)\). The attacker does **not** know \(A,c,W,h\) or the secret \(s\).

Query \(b=F(0)\) and \(F(e_i)\) for each canonical basis vector. Define the observed linear interpolant \(M\) by
\[
M(e_i)=F(e_i)\oplus b.
\]

**If \(M\) is invertible, then \(s\) can be recovered exactly using at most**
\[
\boxed{n+2^r}
\]
**distinct oracle queries**, regardless of the complexity or algebraic degree of \(h\). This includes the \(n+1\) interpolation queries. In particular, 32-bit rank-two residuals need at most **36** chosen evaluations, and rank-three residuals at most **40**, when the tested interpolant is full-rank.

An equivalent directly observable condition, without specifying a hidden affine \(A\), is that the residual-image span
\[
W_{\rm residual}=\mathrm{span}\{F(x)\oplus b\oplus M(x):x\in V\}
\]
has dimension at most \(r\). The algorithm needs only an upper bound on this dimension and full-rank \(M\), not a basis for the subspace.

## Proof

The interpolation construction gives
\[
M(x)=A(x)\oplus L(x)
\]
for a linear \(L\) with image contained in \(W\). Explicitly, its \(i\)-th column is \(h(e_i)\oplus h(0)\). Thus
\[
R(x)=F(x)\oplus b\oplus M(x)\in W
\]
for every input \(x\).

Since \(M\) is invertible, define
\[
T(x)=M^{-1}(F(x)\oplus b)
     =x\oplus M^{-1}(R(x)).
\]
The map \(T\) is a permutation because \(F\) and \(M\) are bijective. Let \(U=M^{-1}(W)\). Then \(\dim U\le r\) and \(T(x)\in x\oplus U\). **Every affine coset \(x\oplus U\) is invariant under \(T\)**, so each cycle of \(T\) has length at most \(2^r\). This conclusion does not require the attacker to reconstruct \(U\).

For the target, set \(z=M^{-1}(y\oplus b)=T(s)\). Starting at \(z\), follow the directed \(T\)-cycle. If any subsequent evaluation yields \(z\), return the predecessor point. Otherwise, after exactly \(2^r-1\) steps without a return, the cycle must have full length \(2^r\); the current point is then its predecessor. In either case that point is \(T^{-1}(z)=s\).

There are \(n+1\) interpolation evaluations and at most \(2^r-1\) further evaluations to traverse the cycle. Caching repeated inputs only reduces the count. Therefore total **distinct** oracle calls are at most \(n+2^r\).

For \(r=0\), the cycle is a fixed point and the initial \(n+1\) calls suffice. For \(r=1\), this reproduces the \(n+2\) full-rank branch of the established [rank-one perturbation theorem](../results/rank-one-nonlinear-perturbation-inversion.md). The earlier theorem also handles a rank-deficient branch; this new claim does **not**.

## Reproduction 1: hidden affine wrappers, two nonlinear families

Executable CommonJS/JSDoc: [\`sims/low-rank-residual-cycle-inversion.js\`](../sims/low-rank-residual-cycle-inversion.js).

Run \`node sims/low-rank-residual-cycle-inversion.js\` with Node 22. The deterministic Xorshift seeds, GF(2) matrix generation, queried inputs, and full-rank refusals are in the script. Three word widths \`8,16,32\`, four residual ranks \`0,1,2,3\`, and two independent construction families each contain **192 source permutations**. Both families use secret invertible input/output binary matrices and affine translations. The nonlinear cores are:

1. A shear that changes the upper \(r\) bits using a pseudo-random Boolean mask depending only on the lower \(n-r\) bits.
2. A wider class that, for each lower-bit fiber, permutes the upper \(r\) bits according to an independently seeded Fisher–Yates permutation; this can depend on the original upper-bit input and need not be a shear.

For all 8-bit source cases, the script exhaustively verifies that all 256 input outputs are distinct. The larger permutations follow from the invertible affine wrappers and within-fiber bijections, without exhaustive 32-bit enumeration. The test makes one complete fresh query ledger for each target, excluding the verifier-provided target value from the attacker's counted oracle calls.

Local Node 22.16.0 execution returned:

| Metric | Result |
| --- | ---: |
| Permutation instances | **4,608** |
| Full-rank interpolants eligible for the theorem | **2,635** |
| Singular interpolants deliberately declined | **1,973** |
| Exact targets inverted among eligible instances | **10,540 / 10,540** |
| Strict over-bound query counts | **0** |
| Largest observed query budget at width 32, \(r=2\) | **36** |
| Largest observed query budget at width 32, \(r=3\) | **40** |

The generator's singular cases are **not** successes. They are an important qualification and a warning against claiming that a one-shot affine interpolation universally inverts low-rank residual permutations. Local \`node --check\` and strict \`tsc --checkJs --strict\` completed successfully on the developed reproducer. A repository-only strict-JSDoc config is committed as \`jsconfig.rank-r-cycle.json\`; the exact remote source has not yet been run through GitHub CI.

## Reproduction 2: all 40,320 three-bit permutations

Independent executable using direct lookup-table inversion instead of the first implementation's Gaussian elimination: [\`sims/low-rank-residual-cycle-width3-exhaustive.js\`](../sims/low-rank-residual-cycle-width3-exhaustive.js).

Run \`node sims/low-rank-residual-cycle-width3-exhaustive.js\`. This enumerates **all \(8!=40,320\)** permutations \(F:GF(2)^3\to GF(2)^3\). For every full-rank interpolant it measures the actual dimension of the span of \(F(x)\oplus b\oplus M(x)\), then recovers **all eight** possible target preimages using that dimension as \(r\).

| Actual residual dimension | Full-rank permutations | Exact target recoveries | Max distinct queries |
| ---: | ---: | ---: | ---: |
| 0 | 1,344 | 10,752 | 4 |
| 1 | 8,064 | 64,512 | 5 |
| 2 | 14,784 | 118,272 | 7 |
| 3 | 8,064 | 64,512 | 8 |
| **Total** | **32,256** | **258,048 / 258,048** | |

The other **8,064** permutations have singular sampled interpolation and are excluded from this conditional theorem. Local Node 22 and strict JSDoc both passed. A separate Python exhaustive enumeration independently reconstructed these counts and all **258,048** successful inversions; both local programs share the mathematical claim and require peer review before promotion.

## Relevance and explicit limits

- This is a conditional **target inversion** bound against a chosen-query oracle, not complete reconstruction of the source implementation or arbitrary unbounded multi-layer obfuscation.
- It applies to arbitrary output-rank-\(r\) nonlinear residuals, including two-sided affine-wrapped rank-two or rank-three within-fiber permutations. The nonlinear control may be dense or high-degree. It does not require learning a hidden output basis.
- It does **not** solve the **singular affine interpolant** case. This case appeared in 1,973 of the 4,608 deterministic wrapped-family samples and in 8,064 of the 40,320 complete width-three permutations. Randomized changes of the interpolation anchor or basis are an open experimental direction, with no guarantee supplied here.
- A general composition of unrelated nonlinear rounds need not have small residual output span. The low-rank output premise must be established for the actual candidate. The theorem is an attacker-cost **negative selection criterion** for that subset, not an obfuscation security enhancement.
- Chosen oracle requests, affine linear-algebra work, server authorization, and program runtime cost are different budgets. This result does not assert compliance or violation of the original obfuscator's **2.5× execution** rule.

**Requested next check:** have a second agent independently prove the invariant-coset argument, verify the query count including the early-stopping case, rerun both scripts on Node 22/Windows, and challenge singular-M handling before considering promotion to \`results/\`.


## Relation to the later general deterministic rank-repair attack

The conditional theorem above is the **zero-repair branch** of Agent 3's more general target-guided deterministic rank-repair algorithm proposed in [PR #181](https://github.com/FlareZ123/obfs/pull/181). That algorithm maintains a synthetic affine map whose error image remains inside the same residual subspace and repairs a singular sampled interpolant by querying only within the target-relevant invariant subspace. When the original sampled interpolant (M) is already invertible, its initial kernel is zero: no rank-repair query is needed, and its target-coset traversal is exactly the cycle traversal proved here. Thus the full-rank (n+2^r) case is a special case of the more general construction, not a distinct attack family.

PR #181 is still an open draft rather than an integrated main-branch result. This note therefore records the mathematical relationship without claiming that the general algorithm has been released or that its broader implementation is part of the current main branch. Its singular-(M) repair proof, distinct-query accounting, and CI evidence should be assessed on that PR's own merits.

The independent review in [full-rank-low-output-residual-independent-review](full-rank-low-output-residual-independent-review-2026-11-22.md) still supports the conditional coset-invariance proof and its exhaustive finite-width checks. It does not establish novelty relative to PR #181, and it does not certify the global residual-rank premise from a small sample. Keep this report in `im-results/`; do not promote it separately to `results/`.


## Rank-unaware execution variant (24 November 2026)

The attacker does **not** need to know the residual rank in order to execute the full-rank cycle walk. After computing (z=M^{-1}(y\oplus b)), it can keep evaluating (T) until the orbit returns to (z). Because (T) is a permutation and the orbit remains in one affine coset of (U), the cycle closes after some (L\le 2^r) evaluations. The predecessor is then the secret input. This rank-unaware version uses at most

\[
n+1+2^r
\]

distinct oracle queries: the (n+1) interpolation inputs plus at most (2^r) cycle points.

The sharper (n+2^r) bound in the theorem uses a known upper bound (k\ge r): after (2^k-1) transitions without closure, the cycle must have maximum allowed length and the current point is already the predecessor, so the final edge need not be queried. Thus knowledge of (r) is needed only for this one-query shortcut, not for termination or correctness.

Executable variants now include `inverseWithoutRankBound` in `sims/low-rank-residual-cycle-inversion.js` and an independent finite-table implementation in `test/low-output-residual-cycle-independent.test.js`. The constructed full-length cycles for (r=1,\ldots,5) avoid every interpolation input and attain exactly (n+1+2^r) distinct queries in the rank-unaware version. The existing rank-aware version attains (n+2^r) by inferring the final edge. These tests validate the one-query difference; they do not certify a small global residual rank from calibration samples.

Accordingly, the earlier caveat that the global rank bound is not cheaply certified should be read narrowly: the attacker need not certify or even know (r) to run the rank-unaware algorithm, but the actual query-count guarantee is still parameterized by the true global residual rank.


The direct implementation plus independent finite-table test passed focused two-platform CI in run [45461222311](https://github.com/FlareZ123/obfs/actions/runs/45461222311), including project and external JSDoc checks. An earlier run exposed only an implicit-any annotation in the new test callback; the annotation was added before the passing run.

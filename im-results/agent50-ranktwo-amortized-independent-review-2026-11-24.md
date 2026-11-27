# Independent review: amortized rank-two versus reanchoring

**Reviewer:** Agent 50. **Date:** 2026-11-24. **Classification:** independent source and query-cache reproduction of Agent 20's multi-target experiment.

## Verdict

The shared-basis rank-two implementation is correct for this deterministic permutation fixture and reproduces the existing deterministic low-rank completion procedure. It prepares one 33-query affine interpolant, completes its one-dimensional nullspace with the same first available standard-basis direction, computes one inverse, and reuses it for all eight targets. A shared cache keyed by unsigned 32-bit input avoids repeated oracle queries.

I independently reproduced both multi-target methods:

- rank-two low-rank: **73 unique oracle inputs**;
- reanchoring: **115 unique oracle inputs**.

All eight exact preimages and forward checks pass. The rank-two orbit lengths are [6,7,1,7,2,7,3,7], totaling 40 after the shared 33-query setup. Reanchoring uses 99 shared anchor-preparation queries and two target checks per target (16), totaling 115.

## Source and premise checks

The source core is

\[
P(x)=x\oplus [((x\mathbin{\&}31)=31)\cdot 2^7]
       \oplus [((x\mathbin{\&}124)=124)\cdot 2^8].
\]

Only output bits 7 and 8 are toggled, and both predicates depend only on bits 0 through 6, which remain unchanged. Therefore P is an involution, not merely a sampled permutation. The affine wrapper has rank 32 and the nonlinear output directions have rank two.

The canonical anchor's observed secant rank is 31, so its affine interpolant has nullity one. The seeded reanchor search tests three anchors: the first two have rank 31; the third, 0xba8c2458, has rank 32. A source-private audit confirms that this selected anchor's normalized B is lower-unitriangular, satisfying the reanchoring theorem's hidden compatibility premise. The reanchor algorithm itself uses only the observed rank and exact target checks; it does not consume the source-private audit.

## Independent query receipts

The checker is sims/agent50-ranktwo-amortized-independent-check.js (commit 4107ddd8e9e35b0c3026f96a6a7a4b2db8816838). It reconstructs the source and affine wrappers, independently implements the shared cache, anchor search, deterministic rank-two completion and both orbit loops, then asserts the exact receipts.

| Method | Shared setup | Per-target checks/orbit | Eight-target total |
|---|---:|---:|---:|
| Reanchoring | 99 (three 33-query anchors) | 2 checks × 8 = 16 | **115** |
| Rank-two low-rank | 33 (one affine interpolant) | orbit lengths sum to 40 | **73** |

The reanchor anchor sequence is 0x477d20b7 (rank 31), 0x8e1d9142 (rank 31), then 0xba8c2458 (rank 32). Every target takes one correction and two checks. The rank-two affine nullity is one and its proven orbit bound is eight; the per-target orbit lengths are [6,7,1,7,2,7,3,7].

The rank-two method uses 42 fewer unique queries than reanchoring (about 36.5% fewer, or 1.575x). The 73 count is exactly 33 setup queries plus 40 orbit queries; no per-target interpolation is repeated.

## Implementation equivalence and accounting caveats

The prepared rank-two adapter matches the current invertLowRankDeterministic implementation's relevant steps: query F(0) and F(e_i), find free columns, complete each with the first standard-basis direction that extends the span, invert the completed matrix, and iterate with orbit cap \(2^{r+d}\). For r=2 and nullity d=1, the cap is eight. The public API currently accepts one target and rebuilds the basis per call; the amortized experiment factors that preparation from target-specific inversion and adds a shared cache. It is therefore a valid multi-target adapter, but not yet a reusable public API.

The cache is sound for this pure, deterministic oracle: identical inputs always have identical outputs. It would not be sound without additional protocol guarantees for a stateful, nonce-dependent or time-varying server endpoint. The reported counts are **unique oracle inputs** after cache reuse, not the number of times the test harness invokes the raw JavaScript oracle.

The test harness also makes direct raw-oracle calls for source-private audits and explicit forward assertions; those are not attacker queries and are not included in the cache totals. The final orbit/check query already verifies F(preimage)=target, so the extra forward assertions are redundant test-only validation calls. The source-private normalized-B audit is likewise validation, not information supplied to the attacker.

## Graph comparison scope

The historical 222,079-call graph batch remains a per-target result. The current graph inverter invokes target-specific relation discovery for each target and exposes no prepared, target-independent relation object in this experiment. Thus 73 versus 115 is a like-for-like amortized comparison between the two shared-basis methods; 222,079 is a historical per-target baseline, not an amortized graph lower bound. A future multi-target graph implementation could change that comparison.

## Recommendation

Accept the 73-versus-115 multi-target result for this deterministic rank-two fixture. Keep the rank-two method's permutation and rank-bound assumptions explicit, and document that the cache requires a stable oracle. If multi-target reuse is intended as a supported capability, factor the prepared affine interpolant/inverse and cache into an explicit reusable API, with tests against the existing single-target deterministic inverter to prevent drift. Do not imply that the graph method's 222,079-call historical batch is amortized on the same basis.

# One nonlinear top coordinate: a 35-query reanchoring inversion theorem

**Agent:** 20. **Date:** 23 November 2026. **Status:** intermediate, mathematically conditional chosen-query attack, pending independent peer review. The primary objective remains RELEASE-BLOCKED.

## Prior established stronger result and proper classification

**This restricted family is already subsumed by the established rank-one nonlinear-perturbation inversion theorem** in [results/rank-one-nonlinear-perturbation-inversion.md](../results/rank-one-nonlinear-perturbation-inversion.md), independently reviewed and exhaustively checked before this note. Since the first n-1 coordinates of P are affine, the entire two-sided wrapped source has the form `F(x)=c XOR A(x) XOR w*f(x)` for one arbitrary scalar nonlinear residual. The existing attacker inverts that broader rank-one class with at most `n+3` calls **even when the chosen interpolation matrix is singular**, and in the full-rank branch with at most `n+2` calls. Thus the reanchoring algorithm studied below is **strictly weaker in scope**, and its 35-call tight example is only tight for this algorithm (the established specialized attacker needs at most 34 calls on it). There is no new attacker-cost improvement for this source family. Preserve this finite experiment as an independent proof route, implementation comparison, and test of the generalized reanchoring criterion; do not promote it to an independently novel main result.

## Declared source class and observable rank condition

Let `n>=2` and the hidden source be `F(x)=a XOR Lout(P(Lin(x) XOR b))` for unknown invertible GF(2) linear maps `Lin,Lout` and offsets. Assume `P` is a compatible triangular bijection whose **first n-1 output coordinates are affine functions** of the input bits; the last coordinate may be any Boolean function of lower input bits XOR its own input bit. In particular, this allows arbitrary nonlinear top-bit gates, while every other coordinate is affine.

As in the original reanchoring theorem, the attacker queries `F(r)` and `F(r XOR e_i)`, obtains the `n x n` finite-difference matrix `M_r` at any chosen anchor, and can test its rank publicly. For this declared source family:

**If `M_r` is full rank, this particular reanchoring algorithm recovers an exact preimage of every published output in at most `n+3` distinct queries.** At `n=32` this is **35 queries**, including interpolation, candidate checks, and exact final verification. At most one fixed-point correction is needed. The source-family premise cannot be certified merely from the finite-difference data, and a singular `M_r` is an explicit refusal case.

## Proof

Write `z_r=Lin(r) XOR b`. Let the affine prefix of `P` have lower-unitriangular linear coefficients `T` and an arbitrary constant vector `c`. For every direction `w=Lin(e_i)`, the first `n-1` output differences of `P(z_r XOR w) XOR P(z_r)` are exactly `Tw`, independent of `z_r`. Consequently, the hidden normalized matrix

`B=Lout^-1 M_r Lin^-1`

has its first `n-1` rows identical to `T`, while only its last row can differ. Those fixed rows are lower unitriangular. If `M_r` is full rank, `B` is full rank, forcing its final diagonal bit also to equal 1. Thus `B` is lower-unitriangular compatible, and `Q=B^-1 P` is a compatible permutation.

Moreover, in the first `n-1` coordinates, the linear map `B` agrees exactly with the linear part of `P`, so `Q_j(z)=z_j XOR d_j` for constants `d_j`, all `j<n-1`. Therefore `h(z)=Q(z) XOR z` has a constant prefix of length `n-1`. In the reanchoring fixed-point formula

`z^(0)=z* XOR h(z*) XOR h(z_r)`,

all first `n-1` hidden bits are correct immediately. One correction using the observed `M_r^-1` repairs the remaining highest bit. Counting `n+1` interpolation queries, one failed candidate query, and one final successful candidate query gives `n+3`. Exact target comparison certifies the returned candidate.

## Tight 32-bit witness

The explicit compatible bijection `P(x)=x XOR ( ((x_30 AND x_29) << 31) )` with identity affine wrappers has `P(0)=0` and `P(e_i)=e_i` for every bit. The public interpolation matrix is identity, so the premise is satisfied.

Let the hidden secret be `s=0xe0000000`, target `P(s)=0x60000000`. The first candidate is `0x60000000`, which fails. One correction reaches `s`, and exact verification passes. The transcript contains **33** interpolation calls plus **2** distinct candidate calls, exactly **35**.

## Source-pinned empirical challenge

`sims/reanchor-top-shear-bound.js` also tests 24 dense hidden affine wrapper sources with 16 independently seeded anchors/targets each. Their triangular source has a mixed affine 31-bit prefix, arbitrary 32-bit affine shifts, and multiple nonlinear top-bit monomials. For every source-known full-rank anchor, the public-only chosen-query inverter is required to return the exact hidden secret in at most 35 distinct calls with at most one correction. A separate GF(2) column-rank implementation classifies source test eligibility without reusing the inverter. Singular anchors are separately counted; the test explicitly requires they occur. The executable test is `test/reanchor-top-shear-bound.test.js`.

This result is a chosen-oracle preimage bound under a special, declared source family. It does not reconstruct arbitrary source code, establish any higher-degree security lower bound, prevent authenticated relaying, or demonstrate the universal 2.5x defender performance requirement. It complements `im-results/reanchor-depth-tightness-2026-11-23.md`, where a more general compatible-basis model permits 64 calls.

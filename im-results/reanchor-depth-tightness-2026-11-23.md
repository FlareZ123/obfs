# A tight 2n-query reanchoring bound under a compatible hidden interpolant

**Agent:** 20. **Date:** 23 November 2026. **Status:** intermediate derivation and reproducible 32-bit attack witness, not a novelty-reviewed theorem. **Release decision:** remains RELEASE-BLOCKED.

## Scoped statement

Consider the earlier reanchoring model `F(x)=a XOR Lout(P(Lin(x) XOR b))`, where `P` is a compatible triangular permutation and `Lin,Lout` are invertible linear maps over GF(2). Let the observed finite-difference matrix `M_r` at anchor `r` be invertible, and suppose its hidden normalized map `B=Lout^-1 M_r Lin^-1` is lower-unitriangular. This premise is source-dependent; a chosen-input attacker does not know how to certify it.

For **n>=2**, the published fixed-point inversion routine succeeds for any target in **at most 2n distinct oracle queries**, sharpening the previous `2n+1` bound to **64** at n=32. A failed or hidden-incompatible basis has no such guarantee. A policy that tries up to `k` unverified bases retains its more conservative aggregate cap of `k(2n+1)` oracle calls, since failed incompatible trials may exhaust all candidate checks. The new `2n` bound applies to a trial satisfying the hidden compatible-basis premise.

## Proof of the extra initially correct bit

Write `z_r=Lin(r) XOR b`, `Q=B^-1 P`, and `Q(z)=z XOR h(z)`, with `h_j` depending only on bits strictly below `j`. The observed finite differences satisfy

`Q(z_r XOR Lin(e_i)) XOR Q(z_r)=Lin(e_i)`

for every basis vector `e_i`, by definition of `M_r` and `B`. Consequently every `h` difference along the basis `{Lin(e_i)}` vanishes at `z_r`.

The first two coordinates of `h` have the forms `h_0=c_0` and `h_1=c_1 XOR a*z_0`. Since the basis `{Lin(e_i)}` spans the hidden space, at least one `Lin(e_i)` has bit 0 set. Its vanishing `h_1` difference forces `a=0`. Thus **both `h_0` and `h_1` are constant** in every source-compatible normalized `Q`.

The original initial candidate `z^(0)=z* XOR h(z*) XOR h(z_r)` therefore has its lowest **two** bits correct. As in the existing inductive proof, every correction `z'=z* XOR h(z*) XOR h(z)` fixes the next bit and preserves all lower bits. At most `n-2` corrections and `n-1` candidate checks are required, following `n+1` interpolation queries. Hence the maximum is `(n+1)+(n-1)=2n` distinct queries.

## Exact nonlinear tightness witness

The executable 32-bit source `sims/reanchor-depth-tightness.js` uses a compatible bijection

- `P(x)_0=x_0`, `P(x)_1=x_1`;
- for `j=2,...,31`, `P(x)_j=x_j XOR (x_(j-1) AND x_(j-2))`.

An independent inverse reconstructs input bits in ascending order, making bijectivity explicit. At anchor zero, `P(0)=0` and `P(e_i)=e_i` for all 32 basis directions, so the observed matrix is identity and satisfies the hidden compatibility premise. The source is nonlinear since `P(3)=7` while the affine-basis prediction is 3.

Choose secret `s=0xffffffff`, published target `P(s)=3`. The initial candidate is `x_0=3`; after `t` corrections, `x_t=2^(t+2)-1` for `0<=t<=30`. The final candidate is `s`. The transcript has **33** interpolation queries plus **31** distinct candidate checks, exactly **64**. It therefore meets the sharpened upper bound. The witness needs no hidden affine wrappers, so the construction is readily audited; adding compatible wrappers does not improve the claimed attack bound.

**Reproduction:** `node --test test/reanchor-depth-tightness.test.js` and `node sims/reanchor-depth-tightness.js`. The test also checks an independent triangular inverse on 4,096 deterministic seeded 32-bit inputs and edge values.

## Limits

This is a conditional chosen-oracle preimage result for a specified compatible basis. Full rank alone does not establish the premise, all-anchor singular examples exist, and random reanchoring against arbitrary dense permutations has no general success guarantee. A preimage attack does not reveal full source code or prove offline cloning, and it gives no guarantee of enforcing an authorized execution environment or a 2.5x defender compute ceiling. The result belongs in `im-results/` pending broader mathematical comparison and source-pinned CI evidence.

## Interpretation relative to prior rank-one inversion

The independent n=3 census below is a compatibility and implementation check rather than independent evidence of harder multi-shear sources: in three bits every compatible permutation has affine output coordinates 0 and 1, and arbitrary nonlinearity can occur only in the highest coordinate. Therefore this entire small-width population is a rank-one residual subclass already covered by the established `n+3` [rank-one inversion theorem](../results/rank-one-nonlinear-perturbation-inversion.md). The direct 32-bit chained witness above, with nonlinear terms in coordinates 2 through 31, is the genuinely multi-output case that distinguishes the 2n conditional derivation from that earlier rank-one attack. Any attack-cost comparison should use independent rank-r methods on the same 32-bit source, rather than assuming a 64-query advantage from a narrow source class.

## Independent exhaustive width-three check

A second self-contained verifier, `sims/reanchor-depth-width3-exhaustive.js`, enumerates all 128 compatible three-bit permutations, all 168 invertible three-bit input linear maps and all eight hidden input offsets, fixing the public anchor at zero. It reconstructs the observed finite-difference map, checks the source-coordinate lower-unitriangular criterion directly, and tries **every eight target preimages** with an independently implemented finite-table fixed-point step. This is a finite census, not an oracle-hardness extrapolation.

The intended exact checks cover 172,032 source-anchor combinations. In an independent Python reference enumeration, 159,744 were full-rank and compatible, 12,288 were singular, and no full-rank incompatible matrices occurred in this width-three family. All **1,277,952** admitted target inversions succeeded with no more than one correction and six distinct queries: 638,976 target cases used four queries, 491,520 used five, and 147,456 attained six. This width-three equivalence of rank and compatibility does not generalize by assumption to wider sources. The suite is `test/reanchor-depth-width3-exhaustive.test.js`; its Node/CI verification is recorded separately when available.


## Independent review and scope boundary (2026-11-24)

Agent 2 and Agent 50 independently reviewed the hidden-coordinate orientation, the (h_0/h_1) argument, the correction induction, and the (n=2) edge case. Both found the (2n) proof valid under the explicit premise that (B=L_{out}^{-1}M_rL_{in}^{-1}) is lower-unitriangular.

Agent 50's independent checker adds 700 wrapped positive cases across widths 2–8 and a 32-bit nonzero-anchor witness with eight recoveries (45–51 calls each, 378 total), all satisfying the hidden-(B) premise. See `im-results/agent50-reanchor-2n-independent-peer-review-2026-11-24.md` and `sims/agent50-reanchor-2n-peer-check.py`.

The same review supplies a four-bit counterexample to any broader claim based only on P being compatible and (M_r) being invertible. With arbitrary invertible input wrapper columns `[2,13,4,3]`, offset 11, anchor 9, and (L_{out}=I), the observed matrix has rank four but normalized (B) is not lower-unitriangular; the 2n iteration misses target 3 for secret zero within the three candidate checks. This is **not** a counterexample to the conditional theorem. It demonstrates that full rank does not certify the hidden compatibility premise, and that arbitrary (L_{in}) cannot be silently admitted.

The headline and any future synthesis must keep the hidden-(B) condition explicit. The theorem is conditional; it is not a general random-anchor guarantee, and the premise is not inferred from an arbitrary chosen-input transcript alone.

A separate Agent 2 boundary study distinguishes two additional failure modes: a three-bit compatible permutation whose fixed-coordinate secant matrix is singular at every anchor (and remains singular under identity embedding), and a four-bit source with full-rank secants but incompatible normalized B, producing a target-specific cycle. An arbitrary-basis existence lemma can restore a full-rank secant basis for a permutation, but it does not establish hidden-B compatibility or an efficient search. These examples are not counterexamples to the conditional theorem; they delimit its premise and the practical anchor/basis search problem. See `im-results/universally-singular-coordinate-bases-2026-11-22.md` and `im-results/affine-differential-flag-oracle-inversion-2026-11-23.md`. An independent exhaustive enumeration of all ordered bases confirms that the width-three source has 144/168 compatible bases at every anchor, and the width-four source has 12,480/20,160 compatible bases at every anchor (13/15 conditional on full rank). These are source-specific small-width counts, not a 32-bit estimate; see `im-results/agent20-arbitrary-basis-peer-check-2026-11-24.md` and its script.


Agent 2's two-sided quintic test adds the complementary target-specific case: seed `0x12345678` converges for the held-out target even though its successful full-rank normalized B is not lower-unitriangular. Conversely, the four-bit incompatible-B cycle above fails its target. Therefore the lower-unitriangular premise is sufficient for the uniform 2n argument, not necessary for an individual target to converge; full rank alone guarantees neither success nor failure. The exact final target-equality guard is essential. A separate seed `0x51515151` hits four rank-deficient anchors and fails after 132 calls; these are fixed deterministic streams, not probability estimates. The positive compatible-anchor witness remains the `0xdeadbeef` stream described in the amortized quintic report.

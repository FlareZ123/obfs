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

## Independent exhaustive width-three check

A second self-contained verifier, `sims/reanchor-depth-width3-exhaustive.js`, enumerates all 128 compatible three-bit permutations, all 168 invertible three-bit input linear maps and all eight hidden input offsets, fixing the public anchor at zero. It reconstructs the observed finite-difference map, checks the source-coordinate lower-unitriangular criterion directly, and tries **every eight target preimages** with an independently implemented finite-table fixed-point step. This is a finite census, not an oracle-hardness extrapolation.

The intended exact checks cover 172,032 source-anchor combinations. In an independent Python reference enumeration, 159,744 were full-rank and compatible, 12,288 were singular, and no full-rank incompatible matrices occurred in this width-three family. All **1,277,952** admitted target inversions succeeded with no more than one correction and six distinct queries: 638,976 target cases used four queries, 491,520 used five, and 147,456 attained six. This width-three equivalence of rank and compatibility does not generalize by assumption to wider sources. The suite is `test/reanchor-depth-width3-exhaustive.test.js`; its Node/CI verification is recorded separately when available.

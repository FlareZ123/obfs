# Explicit family with maximal public-interpolant nullity at fixed residual rank

**Date:** 2026-11-21. **Author:** Agent 8. **Status:** intermediate mathematical construction with executable small-width verification. Independent peer review of the general proof is requested before promotion to established results.

## Proposition

For every integer `r >= 3`, there exists an explicitly constructible permutation `F: GF(2)^(2r) -> GF(2)^(2r)` such that:

1. The public affine interpolant `M` is the linear map defined on each standard basis vector by `M(e_i) = F(e_i) xor F(0)`. It has rank `r` and nullity `r`.
2. The residual space `R = span{F(x) xor F(0) xor M(x):x}` has dimension exactly `r`.

This notation matches the draft deterministic inversion theorem. The construction attains the extremal identity `dim ker M = dim R = r`; its public linear interpolation is singular in all permitted nonlinear directions.

For `r=1,2`, no permutation on `2r` bits can have a public affine interpolant of rank `r`: injectivity forces the `2r` nonzero vectors `F(e_i) xor F(0)` to be distinct, but an r-dimensional image contains only `2^r - 1` nonzero vectors. For r=1,2 the inequalities `2r > 2^r - 1` hold. This establishes the minimal r for the stated family.

## Explicit construction when r >= 4

Let `e_0,...,e_(r-1)` be standard basis vectors of `GF(2)^r`, with indices modulo r. Define

```text
u_i = e_(i+1) xor e_(i+2)
v_i = e_i xor u_i
```

For `0<=i<r`, use the `2r` vector pairs

```text
a_i = (e_i, e_i)
b_i = (v_i, u_i)
```

as columns of a `2r`-by-`2r` binary matrix `A`. Matrix `A` is invertible: apply the linear projection `P(p,q)=p xor q` to any linear dependence among these columns. Every `a_i` projects to zero; each `b_i` projects to `e_i`. Thus the coefficients of all `b_i` must vanish; the remaining `a_i` are linearly independent.

The `2r+1` low-bit inputs `0,e_i,u_i` are pairwise distinct for `r>=4`: their Hamming weights are respectively 0, 1, and 2; all cyclic adjacent pairs `u_i` differ. The desired corresponding outputs `0,e_i,v_i` are also pairwise distinct, with weights 0,1,3. Thus one can define a bijection `h:GF(2)^r -> GF(2)^r` satisfying

```text
h(0) = 0
h(e_i) = e_i
h(u_i) = v_i
```

and fill the remaining positions with the remaining output values in any bijective order.

For each `x in GF(2)^(2r)`, write `A x = (p,q)` with r-bit `p,q`, and define

```text
F(x) = (p, h(q)).
```

Both `A` and `(p,q) -> (p,h(q))` are permutations, so `F` is a permutation. Since `F(0)=0` and `F(e_i)` for each of the `2r` input-basis vectors equals `(e_j,e_j)` or `(v_j,v_j)`, the interpolation matrix `M` has image exactly the diagonal r-dimensional space `D={(z,z):z in GF(2)^r}`. It contains the `r` independent `(e_i,e_i)` vectors and is confined to D. Therefore

```text
rank M = r
dim ker M = r.
```

The projection of `F(x)` onto its first r output bits is linear in x and equals the first r bits of `M(x)`; consequently every residual `F(x) xor M(x)` has zero first-half coordinates. Therefore `dim R <= r`. Because the image of F spans the full 2r-dimensional output space and `F(V) subseteq image(M)+R`, one must also have `2r <= r+dim R`. Hence `dim R = r`, completing the proof.

Any invertible affine input/output reparameterization preserves the intrinsic residual rank. Invertible output linear maps also preserve the interpolant's rank. Thus these examples can be concealed under arbitrary invertible affine wrappers without changing the residual-rank profile. The executable reference below uses the explicit unwrapped form.

### Coordinate-free second-difference characterization

For a function F:V->W over GF(2), define its second finite difference by

```text
Delta_u Delta_v F(x)
  = F(x) xor F(x xor u) xor F(x xor v) xor F(x xor u xor v).
```

For any affine frame B, let L_B be the affine interpolant through the frame and let D_B=F xor L_B. Then

```text
R_B = span{D_B(x): x in V}
    = span{Delta_u Delta_v F(x): x,u,v in V}.
```

**Proof.** Every second difference of an affine map is zero. Therefore each `Delta_u Delta_v F(x)` is the xor of four values of D_B, proving that the second-difference span is contained in R_B.

For the reverse inclusion, change coordinates to the frame B, so D_B(0)=D_B(e_i)=0 for every basis vector e_i. Let S be the span of the second differences in the display. We prove by induction on Hamming weight that every D_B(x) lies in S. The claim holds at weights zero and one because those residuals vanish. For weight at least two, choose distinct i,j in the support of x and set y=x xor e_i xor e_j. Then

```text
Delta_e_i Delta_e_j D_B(y)
  = D_B(y) xor D_B(y xor e_i)
    xor D_B(y xor e_j) xor D_B(x).
```

The first three arguments have strictly smaller Hamming weight than x, so their residuals lie in S by induction. The left-hand side is a second difference and lies in S by definition. Hence D_B(x) also lies in S. This proves R_B is contained in the second-difference span and establishes equality.

The right-hand side is independent of the affine frame, so the residual span itself—not just its dimension—is independent of the chosen public interpolation basis. In particular, an invertible affine input wrapper merely reindexes the points and directions in the same second-difference set. An invertible affine output wrapper F'(x)=B F(x)+c maps every second difference by B, preserving its dimension when B is invertible.

**Important distinction:** this proves invariance of the residual span/rank, not invariance of the public interpolant's rank under input affine wrappers. For the r=3 reference completion used by the executable constructor, replacing the input basis (e_0,e_1,e_2,e_3,e_4,e_5) by (e_0,e_0+e_1,e_2,e_3,e_4,e_5) is an invertible shear (column integers [1,3,4,8,16,32] in the constructor's bit order). The unwrapped public interpolant has rank 3; the sheared input has interpolant rank 4, while the residual rank remains 3. Invertible output-linear wrappers do preserve interpolant rank because they left-multiply its matrix by an invertible matrix.

## The r=3 base case

Use the six columns of an invertible input matrix A, as unsigned 6-bit integers with high three bits first:

```text
[45, 55, 17, 28, 62, 35]
```

These have distinct nonzero upper components `[5,6,2,3,7,4]` and distinct nonzero lower components `[5,7,1,4,6,3]`. They define a six-entry partial permutation h from each lower component to the corresponding upper component, plus `h(0)=0`. Each required input and output is distinct, and the remaining eighth input/output can be matched. The six columns are linearly independent. Construct `F` exactly as above. The same image/quotient argument proves `rank M = dim ker M = dim R = 3`.

## Executable empirical audit

`sims/public-residual-extremal-construction.js` constructs the above family for r=3..8. It reuses the independent brute-force GF(2) reference from `sims/public-residual-width5-6-independent.js` and does not use the proposed production inverter's Gaussian-elimination routines. `test/public-residual-extremal-construction.test.js` pins the outputs and is included in the existing manual Ubuntu/Windows low-rank workflow.

| r | Width n | Oracle targets tested | Max distinct queries | Rank repairs | Max closure expansions |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 6 | 64 (all) | 16 | 3 | 0 |
| 4 | 8 | 256 (all) | 28 | 4 | 0 |
| 5 | 10 | 1,024 (all) | 47 | 5 | 0 |
| 6 | 12 | 32 | 81 | 6 | 0 |
| 7 | 14 | 8 | 112 | 7 | 0 |
| 8 | 16 | 2 | 174 | 8 | 0 |

All **1,386 chosen-target inversions** recovered their exact preimages. The script exhaustively enumerates every input for each generated permutation to check bijectivity, `dim ker M=r` and `dim R=r`. It checks direct second-difference span and forward/inverse residual-space equality for widths 6,8,10, and the chosen-input inversion bound `n+2^(r+1)` for every selected target.

The actual linear algebra and combinatorial construction support the general proposition for all r≥3; the code provides finite regression evidence only. No claim follows about a general 2.5x JS runtime guarantee, resistance to source recovery, server authorization, or commercial release. This result is useful for **rejecting** public low-residual-rank protection ideas, since a singular interpolant cannot by itself rescue them.

Cross-platform execution: [manual low-rank inversion run 44930392228](https://github.com/FlareZ123/obfs/actions/runs/44930392228) completed successfully on both Ubuntu and Windows at exact executable SHA `65429fc36e37dcfc2a6a37b10d753c8873d58bc6`, including the new explicit-construction test, existing inversion regressions, and strict JSDoc checking.

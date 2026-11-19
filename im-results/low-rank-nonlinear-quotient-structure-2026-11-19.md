# Low-rank nonlinear displacement leaves an affine quotient

**Date:** 2026-11-19  
**Agent:** 50  
**Classification:** intermediate algebraic result and candidate-attack direction; pending independent review.

## Statement

Let `V=GF(2)^n`. Suppose a published permutation has the form

```text
F(x) = c XOR A(x) XOR g(x)
```

where `A` is an invertible linear map and every nonlinear displacement `g(x)` lies in a fixed output subspace `R <= V` of dimension `r`.

Define the hidden input subspace

```text
U = A^-1(R).
```

Then all nonlinear behavior is confined inside corresponding `U` and `R` cosets. On the quotient spaces, `F` is exactly the affine map induced by `A` and `c`.

This structure applies in particular to a composition of `k` rank-one shear layers with arbitrary intervening affine linear wrappers: after expanding the composition, the nonlinear displacement is a sum of at most `k` propagated output directions, so `r <= k`.

## Quotient proof

For any `u in U`,

```text
F(x XOR u) XOR F(x)
= A(u) XOR g(x XOR u) XOR g(x)
```

lies in `R`. Thus one `U` coset maps into one `R` coset.

If `x XOR y` is not in `U`, then `A(x XOR y)` is not in `R`. Adding the difference of two values of `g`, which is in `R`, cannot move that vector into `R`. Distinct `U` cosets therefore map to distinct `R` cosets.

When `F` is a permutation, its restriction from each `U` coset to the corresponding `R` coset is a bijection between two sets of size `2^r`.

## What the standard affine interpolation reveals

Query

```text
F(0), F(e_0), ..., F(e_(n-1)).
```

Let `c0=F(0)` and define the observed linear interpolant `M` by

```text
M(e_i) = F(e_i) XOR c0.
```

Write `M=A+E`. For every basis column,

```text
E(e_i) = g(e_i) XOR g(0)
```

lies in `R`, hence the entire image of `E` is contained in `R`.

Three consequences follow.

### 1. Rank loss is bounded by nonlinear output rank

If `M(x)=0`, then

```text
A(x)=E(x) in R,
```

so `x in U`. Therefore

```text
ker(M) <= U
rank(M) >= n-r.
```

The rank-one theorem's two cases `n` and `n-1` are the `r=1` instance of this bound.

### 2. Every nonlinear interpolation residual lies in R

Define the public residual

```text
D(x) = F(x) XOR c0 XOR M(x).
```

Then

```text
D(x)=g(x) XOR g(0) XOR E(x) in R.
```

Chosen queries can therefore reveal vectors in the hidden nonlinear output subspace without reconstructing the nonlinear control functions.

### 3. Knowing R collapses target inversion to 2^r candidates

Because `E(V) <= R`,

```text
M^-1(R) = U.
```

For a published target `y=F(s)`, consider

```text
C_R(y) = { x : M(x) XOR y XOR c0 is in R }.
```

The membership condition is equivalent to

```text
A(x XOR s) in R,
```

and therefore

```text
C_R(y) = s XOR U.
```

The candidate set has exactly `2^r` inputs. If `F` is a permutation, exactly one candidate maps to `y`.

Thus, **once the full subspace R is known**, the attack uses the original `n+1` interpolation queries plus at most `2^r` candidate checks:

```text
n + 1 + 2^r.
```

At `n=32`, this conditional bound is 37 queries for `r=2` and 41 for `r=3`.

## Full-rank interpolant: R is unnecessary

There is a stronger target-specific attack when `M` is invertible.

For target `y=F(s)`, compute

```text
z = M^-1(y XOR c0).
```

For any `t in R`, define

```text
G(t) = F(z XOR M^-1(t)) XOR y.
```

Because `M^-1(R)=U`, every queried input lies in the same `U` coset as `s`. The restriction of the permutation `F` to that coset is a bijection onto the corresponding `R` coset. Since `M^-1` is also a bijection from `R` to `U`, `G` is a permutation of `R`.

The attacker does not need a basis for `R`. Start with `t=0`:

1. query `x=z XOR M^-1(t)`;
2. if `F(x)=y`, return `x`;
3. otherwise set `t=F(x) XOR y` and repeat.

Every failed query returns the next valid element of `R` automatically. Iteration follows the cycle of `G` containing zero. The predecessor of zero in that cycle is exactly a `t` whose corresponding input maps to `y`. The cycle length is at most `|R|=2^r`.

Therefore an invertible interpolant gives an **unconditional target inversion bound**

```text
n + 1 + 2^r
```

without recovering `R`.

For a known `k`-shear architecture, `r<=k`, so `n+1+2^k` is a valid worst-case bound in this full-rank branch. At 32 bits, two propagated directions give at most 37 queries.

The rank-deficient branch remains the unresolved part of the low-rank problem.

## Why k rank-one shears satisfy the model

A rank-one shear adds one fixed direction multiplied by one Boolean scalar:

```text
S_i(z)=z XOR e_i h_i(z).
```

After any later invertible linear maps, that added direction becomes one fixed propagated vector `w_i`. The scalar `h_i` may become an arbitrarily complicated Boolean function of the original input after composition with earlier nonlinear layers, but its contribution remains `w_i f_i(x)`.

Inductively, a `k`-shear affine sandwich has form

```text
F(x)=c XOR A(x) XOR w_1 f_1(x) XOR ... XOR w_k f_k(x).
```

Taking `R=span(w_1,...,w_k)` gives `dim(R)<=k`.

## Computational pilot

`sims/low-rank-shear-quotient-pilot.js` constructs 100 deterministic width-5 permutations with two compatible nonlinear shear layers and independent invertible linear maps around and between them.

For every case it:

- derives the true propagated output span `R`;
- builds `M` only from `F(0)` and the five basis queries;
- checks `rank(M)>=5-r`;
- checks every public residual `D(x)` lies in `R`;
- checks all 32 published targets;
- verifies the quotient candidate set is exactly one `2^r`-point coset and contains one unique true preimage.

Targeted run **44455513909** passed on Ubuntu and Windows at validation head `402d09d09d29a8a3f6129447dff50efe908cf8aa`, including strict external JSDoc. The pilot reported:

```json
{"width":5,"cases":100,"targets":3200,"rangeDimensions":{"1":5,"2":95},"interpolantRanks":{"3":1,"4":34,"5":65},"maxResidualValues":4,"maxCandidates":4}
```

The temporary targeted workflow definition was restored after the source-pinned run; the reusable simulator and report are the intended persistent artifacts.

## Remaining bottleneck

This does **not** provide an unconditional `n+1+2^r` chosen-query inversion theorem, because the attacker still has to recover the full hidden subspace `R`.

Residual queries yield elements of `R`, but an arbitrary or sparse nonlinear control can make one direction rare or absent from a bounded sample. If observed residuals span only a proper subspace, the exact target-coset test above cannot yet use the missing directions.

The rank-one theorem escapes this bottleneck because permutation injectivity and the one-dimensional geometry let the target mismatch or interpolant kernel reveal the unique missing direction directly. The main question for interacting shears is whether an analogous target-specific procedure can recover enough of `R` without globally certifying sparse nonlinear behavior.

This identifies a narrower research target than treating an arbitrary compatible permutation as opaque: **recover the low-dimensional nonlinear displacement span, or prove a query lower bound for doing so under sparse controls.**

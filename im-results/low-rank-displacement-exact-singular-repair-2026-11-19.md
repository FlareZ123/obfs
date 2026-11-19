# Exact deterministic repair of singular low-rank nonlinear displacement

**Date:** 19 November 2026  
**Agent:** 3  
**Classification:** exact chosen-query negative result, pending independent review before promotion to `results/`.

## Statement

Let `V = GF(2)^n`. Suppose a published permutation oracle has a hidden representation

```text
F(x) = c XOR A(x) XOR eta(x),
```

where `A` is an unknown invertible linear map, `c` is an unknown constant, and every nonlinear displacement `eta(x)` lies in one fixed unknown output subspace `S` with `dim(S) <= k`.

No affine-interpolant rank assumption is needed.

Given chosen-input access to `F` and a target `y = F(s)`, the hidden input `s` can be recovered exactly with at most

```text
n + 2^(k+1)
```

distinct oracle queries. At width 32 the bounds are 40 queries for `k=2`, 64 for `k=4`, and 544 for `k=8`.

This extends the earlier full-rank cycle argument to singular affine interpolants by replacing empirical random rank repair with deterministic hidden-subspace closure.

## Initial affine surrogate

Query `F(0)` and every basis vector. Let

```text
b = F(0)
M(e_i) = F(e_i) XOR b.
```

Since

```text
F(e_i) XOR F(0)
= A(e_i) XOR eta(e_i) XOR eta(0),
```

there is a linear map `D` with image contained in `S` such that

```text
M = A + D.
```

The attack maintains this invariant while repairing rank.

Define the hidden input subspace

```text
T = A^-1(S).
```

Then `dim(T) <= k`. For every maintained surrogate `N=A+D_N` with `im(D_N) subseteq S`,

```text
ker(N) subseteq T.
```

Indeed, `N(v)=0` implies `A(v)=D_N(v)` lies in `S`.

## Deterministic subspace closure

Assume the current surrogate `N` is singular. Set `K=ker(N)` and initialize the known subspace as `H=K`. The invariant is

```text
K subseteq H subseteq T.
```

For every nonzero `v` in `H`, query

```text
delta(v) = F(v) XOR F(0).
```

Because `v` lies in `T`, all three terms `A(v)`, `eta(v)`, and `eta(0)` lie in `S`, so `delta(v)` lies in `S`.

Two cases can occur.

### Difference outside the surrogate image

If `delta(v) notin im(N)`, choose any nonzero `q in K` and a linear functional `lambda` with `lambda(q)=1`. Update

```text
N' = N + delta(v) * lambda.
```

The added rank-one map has image in `S`, preserving the surrogate invariant. Since `delta(v)` lies outside `im(N)`, any vector in `ker(N')` must satisfy both `lambda(x)=0` and `N(x)=0`. Therefore

```text
ker(N') = K intersect ker(lambda),
```

so the rank increases by exactly one.

The implementation uses a coordinate functional: choose any set bit of `q` and XOR `delta(v)` into that surrogate column.

### Difference inside the surrogate image

If `delta(v) in im(N)`, solve

```text
N(p) = delta(v).
```

Then

```text
A(p) = delta(v) XOR D_N(p) in S,
```

so `p in T`. If `p` is outside `H`, enlarge `H <- span(H,p)`.

All solutions differ by an element of `K`, already contained in `H`, so expansion does not depend on which right inverse the solver returns.

## Why closure cannot stall

Suppose the current surrogate is singular, every `delta(v)` for `v in H` lies in `im(N)`, and every solved preimage remains in `H`.

Then

```text
F(H) subseteq F(0) XOR N(H).
```

Because `F` is a permutation, `|F(H)|=|H|`.

But `K=ker(N)` is nonzero and contained in `H`. Hence the restriction of `N` to `H` has kernel `K`, so

```text
|N(H)| = |H| / |K| < |H|.
```

That contradicts the inclusion above.

Therefore every singular stage must make deterministic progress. It either discovers a new `T` direction and enlarges `H`, or discovers an `S` direction outside `im(N)` and raises the surrogate rank. Since `H subseteq T` and `dim(T) <= k`, closure cannot expand beyond dimension `k`.

## Query cost of singular repair

Every closure query has an input in the same fixed hidden subspace `T`. Oracle answers are cached across all rank-repair stages. Consequently all singular repairs together can add at most

```text
2^k - 1
```

new nonzero inputs beyond `F(0)`.

This is a global bound across all repairs.

## Full-rank cycle inversion

After repair, the full-rank surrogate still has

```text
N = A + D_N
im(D_N) subseteq S.
```

Define

```text
G(x) = N^-1(F(x) XOR F(0)).
```

Then

```text
G(x) XOR x in U = N^-1(S),
dim(U) <= k.
```

Because `G` is a permutation, it preserves each affine `U` coset.

For target `y=F(s)`, compute

```text
t = N^-1(y XOR F(0)) = G(s).
```

Iterate `G` from `t`. The orbit stays in a coset of size at most `2^k`. When the next value returns to `t`, the current value is the unique predecessor of `t`, hence exactly `s`. This costs at most `2^k` additional oracle queries.

## Final bound

The initial interpolation costs `n+1` queries. Singular repair adds at most `2^k-1`. The final cycle adds at most `2^k`.

Therefore

```text
(n+1) + (2^k-1) + 2^k
= n + 2^(k+1).
```

## Reproducible 32-bit experiment

Implementation:

```text
sims/low-rank-deterministic-repair.js
```

The generator hides a top-`k` nonlinear compatible displacement behind independent dense-looking input and output linear maps plus affine translations. The nonlinear layer is a permutation and its displacement stays inside a `k`-dimensional hidden subspace.

A deterministic corpus of 256 cases at each of `k=2,4,8` produced:

```text
total cases:                  768
initially singular:           497
exact recoveries:             768/768

k=2:
  theorem bound:              40
  max observed queries:       39
  max rank repairs:           2
  max closure dimension:      2
  max cycle length:           4

k=4:
  theorem bound:              64
  max observed queries:       56
  max rank repairs:           3
  max closure dimension:      4
  max cycle length:           15

k=8:
  theorem bound:              544
  max observed queries:       288
  max rank repairs:           3
  max closure dimension:      8
  max cycle length:           255
```

These measurements validate the implementation. The query bound follows from the proof.

## Exhaustive width-3 validation

A separate implementation

```text
sims/low-rank-deterministic-repair-exhaustive-width3.js
```

enumerates all seven two-dimensional subspaces of `GF(2)^3`. For each subspace it enumerates every permutation that independently permutes its two four-element cosets, giving

```text
7 * (4!)^2 = 4,032
```

low-rank permutation models.

Every one of the eight targets is attacked:

```text
32,256 / 32,256 exact target recoveries.
```

Of the 4,032 models, 576 have a singular initial affine interpolant. Every singular model is repaired exactly. The largest observed distinct-query count is seven, below the theorem bound of eleven for `n=3,k=2`.

This exhaustive computation checks the complete coset-preserving permutation class for every two-dimensional hidden subspace in the normalized `A=I` width-3 setting. The general affine-hidden statement follows from the algebraic proof.

## Security consequence

Low-dimensional nonlinear displacement does not become resistant to chosen-query inversion merely because its first affine interpolant is singular.

For a candidate whose full nonlinear displacement is confined to `k` hidden output dimensions, singularity exposes a deterministic repair process. The attacker either obtains a missing output-subspace direction that raises rank, or computes a new hidden input-subspace direction. The latter cannot continue indefinitely because the hidden input subspace has dimension at most `k`.

For small `k`, the resulting query complexity remains practical even with arbitrary unknown affine wrappers and arbitrary nonlinear behavior inside the hidden subspace.

This removes the singular-interpolant caveat from the earlier low-rank cycle result.

## Scope

The theorem requires one fixed hidden output subspace `S` containing every nonlinear displacement `eta(x)`.

It does not establish small `k` for arbitrary compatible permutations. A general multi-level compatible permutation may have nonlinear displacement spanning a large space.

The result concerns exact chosen-query target inversion. It does not by itself reconstruct source code, recover the hidden affine maps, prove a runtime attack against every deployment, or establish a performance property.

No claim about the unavailable full construction of the 2026 MBA-permutation paper follows from this theorem.

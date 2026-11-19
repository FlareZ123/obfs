# Cycle inversion for low-dimensional nonlinear displacement with a full-rank interpolant

**Date:** 19 November 2026  
**Agent:** 2  
**Classification:** exact conditional negative result. The theorem is exact under its stated full-rank condition; singular interpolants remain outside scope.

## Statement

Let `V = GF(2)^n`. Suppose a permutation oracle has a hidden representation

```text
F(x) = c XOR A(x) XOR eta(x),
```

where:

- `A` is an unknown invertible linear map;
- `c` is an unknown translation;
- every nonlinear displacement `eta(x)` belongs to one fixed unknown subspace `S`;
- `dim(S) <= k`.

The attacker receives a target `y = F(s)` and chosen-input oracle access.

Query

```text
F(0), F(e_0), ..., F(e_(n-1)).
```

Let `c0=F(0)` and define the observed affine-interpolation map `M` by

```text
M(e_i) = F(e_i) XOR c0.
```

If `M` is invertible, then the target preimage can be recovered exactly with at most

```text
n + 1 + 2^k
```

distinct oracle queries.

The algorithm does not recover `A`, `S`, or the nonlinear function.

At width 32 this gives:

```text
k=2: at most 37 queries
k=4: at most 49 queries
k=8: at most 289 queries
```

when the interpolant is full rank.

## Proof

The translation cancels from output differences. Write

```text
F(x) XOR c0
= A(x) XOR eta(x) XOR eta(0).
```

Because each interpolation column differs from the corresponding column of `A` by an element of `S`, there is a linear map `D` with image contained in `S` such that

```text
M = A + D.
```

Assume `M` is invertible. Define the transformed oracle

```text
G(x) = M^-1(F(x) XOR c0).
```

Then

```text
G(x) XOR x
= M^-1(F(x) XOR c0 XOR M(x)).
```

The vector inside `M^-1` is

```text
eta(x) XOR eta(0) XOR D(x),
```

which belongs to `S`. Therefore

```text
G(x) XOR x in U
```

for the hidden subspace

```text
U = M^-1(S),
dim(U) <= k.
```

Thus `G` preserves every affine coset `x+U`. Because `F` and `M` are both bijective, `G` is a permutation.

Transform the target:

```text
t = M^-1(y XOR c0) = G(s).
```

Start at `x_0=t` and iterate

```text
x_(j+1) = G(x_j).
```

Every iterate stays inside the same affine coset `t+U`, whose size is at most `2^k`. Since `G` is a permutation, the orbit of `t` is a cycle and returns to `t` within at most `2^k` steps.

If `x_j` is the first predecessor for which

```text
G(x_j) = t,
```

then

```text
G(x_j) = G(s).
```

Injectivity of `G` gives `x_j=s`.

The interpolation costs `n+1` queries. Cycle walking requires at most `2^k` oracle evaluations. Cache reuse can only reduce the distinct-query count.

## Compatible-permutation consequence

This theorem applies directly when a compatible middle permutation changes only `k` hidden output directions.

For example, suppose `P(z)` leaves the lowest `n-k` bits unchanged and allows arbitrary interacting triangular transformations among the highest `k` bits. Then

```text
P(z) XOR z
```

always lies in the span of those `k` high-bit basis vectors.

After arbitrary affine input/output wrappers,

```text
F(x) = a XOR L_out(P(L_in(x) XOR b)),
```

the nonlinear displacement is hidden inside the `k`-dimensional subspace obtained by applying `L_out` to those directions. The theorem therefore applies whenever the observed interpolation matrix is nonsingular.

This rules out a substantial candidate class in any instance that passes the full-rank check. Increasing the Boolean complexity inside a small number of nonlinear output directions does not help against this cycle attack.

## Reproducer

Implementation:

```text
sims/low-rank-displacement-cycle-inversion.js
```

The width-32 experiment generates 256 deterministic cases each for `k=2` and `k=4`. Each middle permutation leaves the lower bits fixed and applies interacting nonlinear triangular shears to the highest `k` bits. Every case also uses dense-looking unknown GF(2) maps on both sides plus unknown input/output affine translations.

The experiment reports full-rank and singular interpolation cases separately. Every full-rank case must recover the exact published target within the theorem bound. Singular cases are explicitly excluded rather than treated as failures or silently resampled.

## Scope

The full-rank condition is essential to this proof. If `M` is singular, `M^-1` does not exist and the transformed cycle oracle cannot be formed directly.

The rank-one theorem in

```text
im-results/compatible-rank-one-shear-two-sided-inversion-2026-11-19.md
```

solves both full-rank and rank-`n-1` interpolation branches when `k=1`, giving the stronger unconditional `n+3` bound.

For `k>1`, a general exact repair for singular interpolants remains open. Experiments show singular interpolation occurs in realistic generated cases, so this condition must remain visible in candidate selection.

The result is a chosen-query inversion theorem. It does not establish any security property, and it does not change the repository's RELEASE-BLOCKED decision.

# Exact chosen-query inversion of one nonlinear compatible shear under two affine wrappers

**Date:** 19 November 2026  
**Agent:** 2  
**Classification:** exact negative candidate-selection theorem, pending independent review before promotion to `results/`.

## Statement

Let `V = GF(2)^n`. Fix a nonzero direction `e` and a linear quotient map `pi: V -> GF(2)^(n-1)` with kernel `span(e)`. For an arbitrary Boolean function `h` on the quotient, define the rank-one shear

```text
S_h(z) = z XOR e * h(pi(z)).
```

In compatible coordinates, take `e` as the highest-bit basis vector and `pi` as the lower `n-1` bits. Then `S_h` is a compatible permutation for every possible truth table `h`.

Let the published oracle be hidden by arbitrary invertible affine wrappers on both sides:

```text
F(x) = a XOR L_out(S_h(L_in(x) XOR b)),
```

where `L_in` and `L_out` are unknown invertible GF(2) maps and `a,b` are unknown translations.

Given a target `y = F(s)` and chosen-input oracle access to `F`, the secret `s` can be recovered exactly with at most

```text
n + 3
```

distinct oracle queries.

At width 32 the bound is **35 queries**.

The algorithm does not reconstruct `h`, `L_in`, `L_out`, `a`, or `b`.

## Normal form

Let

```text
u = L_in^-1(e)
w = L_out(e)
A = L_out composed with L_in.
```

Then `w = A(u)`.

Absorb the affine offsets into one constant `c` and one scalar Boolean function `f`. The oracle has the exact form

```text
F(x) = c XOR A(x) XOR w * f(x),
```

with

```text
f(x XOR u) = f(x)
```

for every `x`. The scalar control is constant on the two-point cosets of `span(u)`.

## Affine interpolation

Query

```text
F(0), F(e_0), ..., F(e_(n-1)).
```

This costs `n+1` evaluations.

Let `c0 = F(0)`. Define the observed linear map `M` by its basis columns:

```text
M(e_i) = F(e_i) XOR c0.
```

Let `ell` be the unique linear functional satisfying

```text
ell(e_i) = f(e_i) XOR f(0).
```

Then

```text
M(x) = A(x) XOR w * ell(x)
     = A(x XOR u * ell(x)).
```

Therefore

```text
M = A composed with (I + u*ell).
```

This is a rank-one update of an invertible linear map. Exactly two cases are possible.

## Case 1: full-rank interpolant

If

```text
ell(u) = 0,
```

then `I + u*ell` and `M` are invertible. Also

```text
M(u) = A(u) = w.
```

Define the residual scalar function

```text
r(x) = f(x) XOR f(0) XOR ell(x).
```

Then

```text
F(x) = c0 XOR M(x) XOR w * r(x),
```

and because both `f` and `ell` are invariant in direction `u` in this case,

```text
r(x XOR u) = r(x).
```

For target `y`, compute without an oracle query

```text
z = M^-1(y XOR c0).
```

If `r(s)=0`, then `z=s`. If `r(s)=1`, then

```text
z = s XOR M^-1(w) = s XOR u.
```

Query `F(z)` once.

- If `F(z)=y`, return `z`.
- Otherwise `F(z) XOR y = w`. Solve `M(v)=w` and return `z XOR v`. Since `v=u`, this returns `s`.

The total is at most `n+2` distinct queries in the full-rank case.

## Case 2: rank-`n-1` interpolant

If

```text
ell(u) = 1,
```

then `I + u*ell` has kernel exactly `span(u)`. Consequently,

```text
rank(M) = n-1
kernel(M) = span(u).
```

The interpolation queries therefore reveal the hidden input pair direction `u` directly by Gaussian elimination.

One additional query at `u` gives the output pair direction:

```text
w = F(u) XOR F(0),
```

because the original scalar control satisfies `f(u)=f(0)`.

In this case the image of `I+u*ell` is `kernel(ell)`, so `w=A(u)` is outside `image(M)`.

For target `y`, exactly one of

```text
y XOR c0
y XOR c0 XOR w
```

belongs to `image(M)`. Solve `M(z)` equal to that member. The solution set is the pair

```text
{ s, s XOR u }.
```

Query one representative `z`.

- If `F(z)=y`, return `z`.
- Otherwise return `z XOR u`.

This case costs at most `n+3` distinct queries.

## Query theorem

Combining the two rank cases gives the exact worst-case bound

```text
n + 3.
```

The argument is independent of the complexity, density, algebraic degree, or truth-table size of `h`. The scalar control may be dense, sparse, adversarial, or pseudorandom.

The theorem uses the rank-one nature of the nonlinear layer. It does not extend automatically to a composition of multiple interacting triangular shears.

## 32-bit reproducer

Implementation:

```text
sims/compatible-rank-one-shear-two-sided-inversion.js
```

The reproducer tests 256 deterministic 32-bit cases:

- 128 dense nonlinear controls built from Boolean products/parities;
- 128 exponentially sparse point controls;
- independent dense-looking input/output GF(2) maps;
- unknown input and output affine translations;
- random published targets.

All 256 targets are recovered exactly. The observed interpolation ranks include both theorem branches:

```text
rank 31: 55 cases
rank 32: 201 cases
```

The observed maximum is 35 chosen queries, equal to the width-32 theorem bound.

## Security consequence

A single arbitrary nonlinear top-bit shear is insufficient to rescue the two-sided affine-wrapper candidate. Even if its Boolean control is too large or irregular to reconstruct, chosen-query target inversion remains linear in word width.

This eliminates a much broader class than the one-sided-wrapper theorem: the attacker may face unknown affine transformations on **both** sides, provided the compatible middle permutation has only one nonlinear shear layer.

A candidate based on hidden compatible permutations therefore needs genuinely interacting nonlinear layers. Merely replacing a sparse top-bit condition with a dense or high-degree Boolean condition does not change this inversion bound.

## Scope and open problem

The unrestricted compatible permutation

```text
L_out(P(L_in(x)))
```

can contain one nonlinear shear at every tree level. The proof above does not show how to peel multiple shears without first recovering hidden structure.

The current arbitrary-compatible two-sided CEGAR attack remains empirical, and the sparse certification lower bound remains relevant to attempts that globally validate hidden functionals.

A high-value next question is whether the `n+3` interpolation/correction idea can be iterated over the normal series of the rooted-tree automorphism group, or whether interacting lower-level shears create a genuine superpolynomial target-inversion barrier.

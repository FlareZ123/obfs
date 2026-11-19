# High public residual rank does not imply inversion hardness

**Date:** 2026-11-19  
**Agent:** 1  
**Classification:** intermediate negative witness; independently review before promotion.

## Witness

Consider the public 32-bit permutation

```text
F(x) = 3*x mod 2^32.
```

Its public affine-residual rank is exactly

```text
r(F) = 30,
```

yet its exact inverse is

```text
F^-1(y) = 0xAAAAAAAB * y mod 2^32,
```

because

```text
3 * 0xAAAAAAAB = 1 mod 2^32.
```

In JavaScript this is one public `Math.imul` plus unsigned coercion.

This is a concrete guardrail for the residual-rank research program:
high residual rank is an escape from the low-rank chosen-query theorem,
but it is not evidence that a public permutation is difficult to invert.

## Exact residual-rank proof

The standard affine interpolant is determined by the images of zero and
the 32 basis vectors.

Here

```text
F(0) = 0.
```

For `i<31`,

```text
F(2^i)
  = 3*2^i
  = 2^i XOR 2^(i+1),
```

and at `i=31` the shifted term drops modulo `2^32`. Therefore the
interpolating GF(2)-linear map is

```text
M(x) = x XOR (x << 1)
```

with 32-bit truncation.

Since integer multiplication by three is

```text
F(x) = x + (x << 1) mod 2^32,
```

the residual is precisely the carry contribution between integer
addition and XOR:

```text
D(x) = F(x) XOR M(x).
```

No carry can affect output bit 0, and output bit 1 is the sum of
`x_1` and `x_0` with no incoming carry from bit 0. Thus

```text
D(x) & 3 = 0
```

for every `x`. All residuals lie in the 30-dimensional subspace with
the two low bits zero, so

```text
r(F) <= 30.
```

For the lower bound, choose

```text
x_k = 3*2^k,
k = 0,...,29.
```

Directly,

```text
F(x_k) = 9*2^k mod 2^32,
M(x_k) = 5*2^k mod 2^32,
D(x_k) = 12*2^k mod 2^32.
```

The 30 residual vectors `12*2^k` have distinct least set-bit
positions 2 through 31. They are therefore linearly independent over
GF(2), proving

```text
r(F) >= 30.
```

Hence

```text
r(F) = 30.
```

## Exact public inverse

The constant

```text
0xAAAAAAAB
```

is the multiplicative inverse of three modulo `2^32`. Therefore

```javascript
Math.imul(y >>> 0, 0xAAAAAAAB) >>> 0
```

recovers the exact input from every output.

The executable witness in
`sims/high-residual-trivial-inverse32.js` validates the 30 explicit
residual directions and checks exact inversion on edge cases plus
100,000 deterministic pseudo-random 32-bit values.

## Tunable trivial-inverse family

The same phenomenon spans every residual rank below 31. For

```text
F_s(x) = (1 + 2^s) * x mod 2^32,
1 <= s <= 31,
```

the standard affine interpolant is

```text
M_s(x) = x XOR (x << s).
```

The low `s` output bits cannot receive a contribution from the shifted
term, and bit `s` has no incoming carry. Therefore every residual has
bits 0 through `s` equal to zero, giving

```text
r(F_s) <= 31-s.
```

For `s>=2`, choose

```text
x_k = (1+2^s) * 2^k,
0 <= k < 31-s.
```

Then direct expansion gives

```text
D_s(x_k) = 2^(k+s+1),
```

so the residuals are distinct unit vectors in positions `s+1`
through 31 and are independent. The `s=1` case is the multiplier-three
witness above, with residuals `12*2^k`. Hence

```text
r(F_s) = 31-s.
```

Every multiplier `1+2^s` is odd and therefore has a public modular
inverse modulo `2^32`. The family realizes every residual rank

```text
30, 29, ..., 1, 0
```

while retaining a one-`Math.imul` inverse.

The executable family audit in
`sims/trivial-inverse-residual-rank-family32.js` checks all 31
multipliers, their explicit independent residual witnesses, the low-bit
upper-bound condition on deterministic samples, and exact inversion.

## Contrast with the generic residual attack

The rank-only chosen-query theorem gives, at `r=30` and `n=32`,

```text
n + 1 + 2^(r+1)
= 33 + 2^31
= 2,147,483,681
```

expected queries as its generic ceiling.

That ceiling is valid as an attack upper bound but wildly non-tight for
this mapping: source-visible algebra gives an exact one-operation
inverse.

This demonstrates why candidate selection must combine independent
attack families. A candidate should not receive positive credit merely
for forcing the residual-rank attack into a large generic bound.

## Design implication

Residual rank is useful as a stop rule in one direction:

- low `r`: reject, because the chosen-query inverter is cheap;
- high `r`: continue testing with structural, static, dynamic,
  algebraic, and runtime attacks.

The second case is deliberately inconclusive.

Public arithmetic permutations such as odd multiplication can generate
many independent carry residuals while retaining a trivial public
inverse. More generally, a high-dimensional nonlinear truth-table
residual does not imply that the source representation hides the
inverse structure.

## Validation status

The proof is analytic and the executable witness is reproducible, but
the result should remain in `im-results/` pending source-pinned
two-platform validation and independent review.

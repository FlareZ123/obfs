# Additive encoded-domain arithmetic is black-box affine-recoverable

**Date:** 18 November 2026. **Agent:** 8. **Classification:** intermediate negative result / candidate kill. This is a bounded mathematical result for the additive-only grammar preregistered in `workplace/native-encoded-domain-candidate-2026-11-18.md`. It is not a theorem about arbitrary JavaScript or richer nonlinear encodings.

## Candidate under review

The preregistered pilot proposed keeping proved Int32 SSA values under per-edge additive masks

```text
E_m(x) = x + m  (mod 2^32)
```

while admitting only constants, input variables, addition, subtraction, and `Math.imul(value, constant)`, with matching Int32 truncation boundaries.

The motivation was runtime cost: this grammar can remain close to native JavaScript operator count and avoids a VM or dispatcher.

## Exact affine closure

Let `R = Z/(2^32)`. Every expression in the admitted grammar denotes an affine map

```text
f(x_1,...,x_n) = b + a_1 x_1 + ... + a_n x_n   in R.
```

Proof is by structural induction:

- each input `x_i` is affine;
- each literal constant is affine;
- addition and subtraction preserve affine form;
- `Math.imul(g(x), c)`, interpreted at the admitted Int32 boundary, multiplies every coefficient and the constant term of `g` by the public constant `c` in `R`;
- adding an encoding mask changes only the affine constant term.

Therefore changing the mask independently at every SSA edge does not change the function family. Decoding the final value also changes only the constant term.

## Exact black-box recovery

An attacker with ordinary execution access does not need to recover any mask or parse the emitted source.

Query the public function at the all-zero vector:

```text
b = f(0,...,0)
```

Then for each input coordinate `i`, query the unit vector `e_i`:

```text
a_i = f(e_i) - b  (mod 2^32).
```

The resulting `n+1` observations define the exact affine function on the entire Int32 input domain. Signed JavaScript results are recovered by the ordinary two's-complement interpretation of the 32-bit residue.

For one input this takes exactly two observations. The repository already contains a still cheaper one-observation recovery for the narrower slope-one affine family in `sims/coo-runtime-one-query-reconstruct.js`; this derivation generalizes the functional-cloning failure to arbitrary public constant coefficients in the proposed additive-only grammar.

## Decision

The additive-only native encoded-domain pilot is **killed before implementation** under COO/SNO public execution access. It cannot create material functional-cloning resistance over ordinary minification because the complete protected leaf behavior is exactly recoverable with `n+1` chosen inputs, independent of:

- build seed;
- number or placement of per-edge masks;
- emitted identifier names;
- source layout;
- static deobfuscator sophistication.

Static algebraic normalization would also be straightforward, but it is unnecessary for the negative security decision because the black-box attack alone reconstructs the protected behavior.

This result does not say that every encoded-domain design is useless. It says the proposed low-overhead **affine** domain is the wrong security candidate.

## What would have to change

A successor must introduce behavior outside this affine family, such as variable-variable multiplication, data-dependent nonlinear bitwise structure, or table/state dependence. Those extensions immediately create a new cost problem: preserving a masked representation through nonlinear operations generally requires extra products/conversions or reveals an unmasked boundary. Any successor should first derive its algebraic closure and cheapest black-box learner before implementation, then retain the same strict 2.5x native runtime veto and equal-trust minified control.

No production compiler changes follow from this result.


## GF(2) corollary: XOR/rotation-only masking is also exactly learnable

A second cheap domain would encode a word with XOR masks, optionally combined
with fixed bit permutations such as rotation, then admit only XOR, fixed
rotations, and fixed logical shifts. That family also fails before
implementation.

Treat every 32-bit input as a vector over `GF(2)^32`. XOR is vector
addition. Fixed rotations and fixed shifts are linear maps on those vectors.
An XOR mask contributes only an affine constant. Therefore any `n`-word
function in this grammar has the form

```text
F(x_1,...,x_n) = b XOR A_1 x_1 XOR ... XOR A_n x_n
```

for binary `32 x 32` matrices `A_i`.

A black-box attacker queries the zero vector to obtain `b`, then flips one
input bit at a time. For every basis bit `e_{i,j}`,

```text
F(e_{i,j}) XOR b
```

is exactly the corresponding matrix column. Thus **`32n + 1` chosen
queries** recover the complete 32-bit function, independent of the number of
per-edge XOR masks, rotations, identifier choices, or source layout. For one
32-bit input the exact learner needs 33 observations.

This corollary does not cover mixed ARX code containing modular addition,
variable-variable multiplication, table lookups, or other nonlinear
operations over `GF(2)`. It does mean a successor should not spend an
implementation cycle on a pure XOR/rotate/shift encoded domain.

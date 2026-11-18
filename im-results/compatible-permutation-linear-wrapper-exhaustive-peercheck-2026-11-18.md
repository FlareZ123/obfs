# Independent exhaustive small-width check of the compatible-permutation linear-wrapper theorem

**Agent:** Agent 3  
**Date:** 18 November 2026  
**Classification:** intermediate peer validation of Agent 2 PR #147. This supports the theorem logic; it is not a substitute for the 32-bit proof.

## Question

Agent 2's draft PR #147 claims that a congruence-preserving permutation composed with one arbitrary unknown invertible GF(2) linear map can be black-box inverted in either orientation:

```text
F(x)=L(P(x))
F(x)=P(L(x))
```

The 32-bit simulator in that PR uses randomized compatible permutations and randomized invertible matrices. This check uses a different validation regime intended to expose hidden generator assumptions or an implementation error in the inversion logic.

## Exhaustive model

At width 3, every compatible permutation can be represented by triangular output bits

```text
y_k = x_k XOR f_k(x_0,...,x_(k-1))
```

with an arbitrary truth table for each `f_k`. There are

```text
2^(1+2+4) = 128
```

such permutations.

There are exactly 168 invertible 3x3 matrices over GF(2). The reproducer enumerates all 128 compatible permutations, all 168 invertible maps, all 8 secrets, and both wrapper orientations. It independently implements the subspace-membership outer inverter and nested-kernel inner inverter.

Reproducer: `sims/compatible-permutation-linear-wrapper-exhaustive-small.js`

Local runtime: Node `v22.16.0`.

Observed result:

```json
{"width":3,"compatiblePermutations":128,"invertibleLinearMaps":168,"secretsPerMap":8,"orientations":2,"totalExactRecoveries":344064,"result":"all exact"}
```

All **344,064 / 344,064** exact target recoveries succeeded.

## Proof review

The outer argument is structurally sound. Compatibility and bijectivity imply that `P(0) XOR P(2^j)` has lowest set bit exactly `j`; those differences form a triangular basis of the low-`j)-zero subspace. An unknown invertible linear map preserves the nested subspace flag, so membership of `target XOR F(prefix)` decides each secret bit.

The inner argument is also structurally sound. On the hidden subspace `T_k={v : L(v) has k low zero bits}`, bit `k` of `F(v) XOR F(0)` equals bit `k` of `L(v)`. That is a nonzero linear functional whose kernel is exactly `T_(k+1)`. Repeated kernel extraction therefore yields a toggle for each hidden congruence bit. Applying the toggle to a current candidate preserves all lower output congruence bits and flips the next one.

The exhaustive width-3 result exercises every function and linear map in the theorem's small-width universe and found no counterexample.

## Scope

This validation supports the one-sided theorem only. It does not establish the general sandwich `L_out(P(L_in(x)))` with two unrestricted unknown linear maps, and it does not reproduce the unavailable expanded Wang et al. MBA construction. The 32-bit query bounds remain mathematical consequences of the proof rather than consequences of this width-3 enumeration.

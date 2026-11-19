# MBA Int32 affine-residual rank screen

**Date:** 19 November 2026  
**Agent:** 3  
**Classification:** intermediate algebraic/computational result.

## Question

The budget-surviving one- and two-round Int32 MBA candidate is already broken by a frozen source-aware parameter recovery attack. The deterministic public affine-residual theorem on PR #181 gives a different black-box veto when the affine-residual rank is small.

Do those two attack families explain the same weakness?

## Candidate

The exact candidate is the existing optimized fixed-parameter transform in:

```text
sims/mba-author-int32-heldout.js::optimizedTransform32
```

One round is:

```text
x = 0x91e10da5 XOR imul(0x6d2b79f5, x)
x = x XOR (x >>> 7) XOR (x >>> 19)
x = rol(x,3) XOR rol(x,11) XOR rol(x,23)
```

All operations are over the low 32 bits.

The screen is:

```text
sims/mba-int32-residual-rank-screen.js
```

It samples deterministic second finite differences

```text
F(0) XOR F(a) XOR F(b) XOR F(a XOR b)
```

and computes their GF(2) span rank.

By the intrinsic characterization in PR #181, these values lie in the affine-residual span, so every observed independent value is an exact lower bound on residual rank.

## Deterministic sample result

Using 128 fixed xorshift32-derived direction pairs per depth:

```text
rounds=1:
  rank after 16 samples: 16
  rank after 32 samples: 29
  rank after 48 samples: 29
  rank after 128 samples: 29

rounds=2:
  rank after 16 samples: 16
  rank after 32 samples: 32
  rank after 128 samples: 32

rounds=4:
  rank after 16 samples: 16
  rank after 32 samples: 32
  rank after 128 samples: 32
```

The two- and four-round residual ranks are therefore exactly 32, because 32 is the ambient maximum.

## Exact one-round rank

The one-round result is also exact.

The last two layers of one round are invertible GF(2)-linear maps. They preserve the dimension of the second-difference span. The constant XOR in the first layer is affine and disappears from second differences.

It is therefore enough to study

```text
P(x) = 0x6d2b79f5 * x mod 2^32.
```

The multiplier satisfies

```text
0x6d2b79f5 mod 8 = 5.
```

Modulo 8,

```text
P(x) = 5x = x + 4x.
```

The low three output bits are GF(2)-linear in the low three input bits: bits 0 and 1 are copied, while bit 2 is the XOR of input bits 2 and 0. Any carry produced at bit 2 exits the three-bit quotient and cannot affect those low three bits.

Consequently every second finite difference of `P` has its low three bits zero. Its second-difference span has dimension at most 29.

The deterministic screen exhibits 29 linearly independent second differences. Therefore the one-round public affine-residual rank is exactly

```text
r = 29.
```

Because invertible output-linear layers preserve that dimension, the complete one-round MBA transform also has exact residual rank 29.

## Security interpretation

This separates two attack families cleanly.

The one-round candidate has exact residual rank 29. Even with exact rank known, the generic deterministic low-rank bound at width 32 is

```text
32 + 2^30 - 1 = 1,073,741,855 chosen queries.
```

That bound is not a practical low-rank veto.

The two-round candidate has full residual rank 32. The affine-residual theorem therefore gives no useful small-query guarantee for it.

Yet the existing frozen source-aware attacker recovers the budget-surviving one- and two-round family exactly from ordinary-minified source. The prior held-out result reports 32/32 exact parameter recoveries and preimages.

The conclusion is therefore sharper than saying the MBA candidate is merely low-rank. It is not. By two rounds it has full affine-residual rank, and one round already has rank 29. Its demonstrated failure comes from source-visible reversible structure and parameter recovery, not from the new low-rank black-box theorem.

## Candidate-selection consequence

High affine-residual rank is a necessary escape from the deterministic low-rank veto, but it is not evidence of source resistance.

A future permutation candidate should pass both screens independently:

1. its second-difference/residual rank should be high enough that the low-rank deterministic inverter has no practical query bound;
2. its source representation should resist a frozen source-aware normalizer/inverter after realistic inlining and minification.

This MBA Int32 family passes the first screen at the two-round depth that remains inside the measured runtime budget, while failing the second.

## Reproduction

```text
node sims/mba-int32-residual-rank-screen.js
node --test test/mba-int32-residual-rank-screen.test.js
```

The screen is deterministic and records rank checkpoints rather than interpreting a failure to reach full rank as an upper bound. Only the one-round upper bound is supplied analytically above.

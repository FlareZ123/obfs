# Two-sided compatible-permutation sandwich: affine-fiber attack and counterexample

**Date:** 18 November 2026. **Agent:** 2. **Classification:** exploratory intermediate result. This file deliberately records both the successful heuristic and the adversarial failure.

## Open model

The one-sided theorem covers `L(P(x))` and `P(L(x))`. The remaining natural model is

```text
F(x) = L_out(P(L_in(x)))
```

with two independent unknown invertible GF(2) maps and a compatible permutation `P`.

The direct congruence flag is hidden on both the input and output sides, so the one-sided proofs do not apply.

## Affine-fiber heuristic

A compatible permutation is triangular in hidden bit coordinates. Once the first hidden input coordinates are fixed, some next hidden output coordinates become affine functions on that affine fiber.

The experimental attacker therefore repeats:

1. maintain an affine input subspace known to contain the target preimage;
2. sample second derivatives of the vector-valued oracle on that subspace;
3. use the orthogonal complement of the sampled derivative span as candidate output masks whose scalar components appear affine on the fiber;
4. convert each nonconstant affine component into a linear equation on the remaining input coordinates using the published target;
5. solve those equations to shrink the affine input subspace;
6. repeat until one candidate remains.

The implementation used a deterministic PRNG and stopped a derivative-rank search after 128 consecutive samples failed to increase the observed span. This is a probabilistic sampling rule, not a proof that the recovered affine-mask space is complete.

## Random-family evidence

With independent dense invertible 32x32 GF(2) maps on both sides:

- **500/500** random nonlinear triangular compatible permutations were inverted exactly;
- distinct chosen queries ranged from **3,177 to 6,264**, median **4,577**;
- median local attack time was about **20.1 ms**.

A separate degree-7 Rivest-polynomial batch also achieved:

- **500/500** exact target inversions;
- **3,683 to 6,822** distinct chosen queries, median **5,592**;
- median local attack time about **8.84 ms**.

Earlier 100-case development runs for each family also recovered every target.

## Adversarial counterexample to the universal heuristic claim

A deliberately sparse triangular permutation invalidated the idea that finite random derivative sampling yields a universal black-box attack.

The counterexample keeps each bit unchanged except for rare triangular flips triggered when all lower bits are one. The target was chosen so the hidden pre-permutation value hit that rare pattern. With the same 128-sample rank-stability rule, the affine-fiber attacker accepted a false affine relation and ended with a candidate whose oracle output did not equal the published target.

This failure is important. An arbitrary compatible permutation can hide nonlinear behavior on exponentially rare fibers, so a finite random derivative test cannot certify global affinity in the worst case.

## Consequence

The unrestricted sandwich remains **open at theorem level** in this investigation.

The random-family evidence is still useful as an adversarial baseline: ordinary randomized triangular or Rivest-polynomial sandwiches should be tested against affine-fiber learning before being treated as strong. A candidate that relies on sparse or target-dependent nonlinearities to evade that learner must then be evaluated for its own static visibility, runtime cost, instrumentation exposure, and correctness.

Do not promote the 500/500 random-family result into a universal security claim. The rare-pattern counterexample is a required part of this result.

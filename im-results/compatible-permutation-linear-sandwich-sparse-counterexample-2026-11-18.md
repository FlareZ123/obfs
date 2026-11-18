# Sparse-compatible counterexample for the sampled two-sided sandwich attack

**Agent:** Agent 3  
**Date:** 18 November 2026  
**Classification:** intermediate negative control that bounds `compatible-permutation-linear-sandwich-blackbox.js`.

## Purpose

The two-sided CEGAR attack in `compatible-permutation-linear-sandwich-blackbox.js` validates each candidate output functional on 128 fresh random directional second derivatives. That made 192/192 structured 32-bit triangular and Rivest targets invert exactly. Random validation can miss deliberately sparse nonlinearity, so the attack must not be read as a theorem for arbitrary compatible permutations.

## Counterexample

This witness uses two independently generated dense invertible 32x32 GF(2) maps around the triangular permutation

```text
P(x) = x, except:
bit31(P(x)) = bit31(x) XOR [low31(x) == trigger].
```

The lower 31 output bits equal the lower 31 input bits. The top bit is conditionally toggled using lower bits only, so `P` is a compatible bijection.

The trigger is selected from the hidden inner-linear image of the published secret. The published target therefore exercises the rare nonlinear branch, while a random validation point reaches that exact 31-bit lower pattern with probability about `2^-31`.

Reproducer:
- `sims/compatible-permutation-linear-sandwich-sparse-counterexample.js`
- regression: `test/compatible-permutation-linear-sandwich-counterexample.test.js`

With deterministic seed `0x6a09e667`, the sampled CEGAR learner accepts a false flag with no sampled witness and reaches its final equality guard after roughly 14.2k chosen oracle evaluations. The guard correctly throws `sandwich inversion failed final equality`.

## Consequence

The sampled sandwich attack remains useful empirical evidence against the tested dense-linear wrappers around Rivest degree-3/7 and ordinary nonlinear-triangular families. It does not establish black-box invertibility for every compatible permutation.

The counterexample also identifies the precise missing ingredient for a theorem: an exact or deterministically complete way to certify that an output mask annihilates all directional second derivatives on the current hidden input subspace. Random CEGAR validation cannot provide that guarantee for an adversarially sparse truth table.

The one-sided linear-wrapper theorem is unaffected because its proof does not rely on sampled second-derivative certification.


## Validation pin shared with the positive attack

The sparse witness is included in the same source-pinned manual validation run **44413244729** at `692d979fdfa0392c2d1213feb7d181c15ac7ae08`. Ubuntu and Windows both passed the behavioral/adversarial suite, including the regression that requires the sampled learner's final equality guard to reject this sparse case, together with source and strict external JSDoc checks. Ubuntu also passed the Chromium integration lanes.

The positive 192-target attack and this adversarial failure therefore share one validated source pin. Any future summary should cite both when discussing the sampled two-sided method.

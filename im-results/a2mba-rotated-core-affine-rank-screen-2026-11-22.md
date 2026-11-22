# Intermediate result: full nonlinear residual rank is insufficient for rotated-core resistance

**Date:** 22 November 2026. **Status:** intermediate candidate-screen evidence, not a protection theorem or a release qualification.

## Question

Agent 2 proposed screening fused bitvector regions for low-dimensional nonlinear displacement before spending further runtime or integration budget. This experiment applies that screen to the already documented A²MBA rotated-core Int32 port and asks whether the sampled displacement rank can separate a publicly normalized representation from its native baseline.

## Exact diagnostic

Use the four-input region functions from `sims/a2mba-rotated-core-int32-pilot.js` and the fixed, injective affine 32-bit slice

```text
E(x) = (x, ROL7(x) xor 0x6c8e9cf5,
       ROL13(x) xor 0x13579bdf,
       ROL19(x) xor 0x2468ace0)
F(x) = region(E(x))
```

Define the affine interpolant by its values on the origin and unit vectors:

```text
A_F(x) = F(0) xor XOR_{i: bit_i(x)=1} (F(2^i) xor F(0))
D_F(x) = F(x) xor A_F(x)
```

The diagnostic computes the GF(2) linear-span rank of observed 32-bit `D_F(x)` values. All 496 distinct two-bit inputs and 4,096 deterministic xorshift32 inputs (seed `0x71a3c9f5`) are checked per function. A rank of 32 exhausts the possible 32-bit output-space rank; a lower sampled rank is only a lower bound on the true residual span. This diagnostic is defined on **one public input slice**. It neither proves a representation of the original 128-bit domain nor bounds chosen-query inversion on the unrestricted function.

## Local reproduction and result

The standalone reproducer and regression are:

- `sims/a2mba-rotated-core-affine-rank.js`
- `test/a2mba-rotated-core-rank-screen.test.js`

Executed with Node `v22.16.0` on Linux. The two focused Node tests passed locally; a remote full-platform gate has **not** been run for this commit.

| Case | Sampled residual span rank | Observations |
| --- | ---: | ---: |
| Identity `F(x)=x` | 0 | 4,592 |
| Rank-one quadratic shear `x xor ((x0 & x1) << 2)` | 1 | 4,592 |
| Independent rank-two quadratic shear | 2 | 4,592 |
| Original four-input region on `E(x)` | **32** | 4,592 |
| Same original region on degenerate slice `(x,0,0,0)` | **0** | 4,592 |
| Rotated cores at rotations 1, 8, 16 and 31 on `E(x)` | **32 each** | 4,592 each |

For each of those four rotations, the script additionally checked 10,000 deterministic input vectors against the original region and found exact Int32 output parity. The original pilot already checked broader rotations and source semantics; this new screen does **not** independently re-prove all those identities.

## Interpretation

A second slice exposes the diagnostic's dependence on domain selection: on the public path `(x,0,0,0)`, the same region evaluates to the constant zero, yielding residual rank **0** despite the original four-input region having full sampled rank 32 on `E(x)`. A low-rank subspace by itself therefore cannot establish a low-rank *whole-function* decomposition or satisfy a low-rank attack theorem's hypotheses. An attack inference needs a proven global structural model or a chosen-input strategy that actually reaches the relevant target domain.

The rotated core and its native baseline compute the same `F` on the public affine slice, so their residual ranks must coincide if the semantics are preserved. The maximum observed rank therefore **does not** rescue the representation from the existing source-only normalizer. That independent frozen recognizer already recovered 32/32 later-generated rotated-core instances under its stated grammar in the [source-pinned 19 November report](a2mba-rotated-core-int32-feasibility-2026-11-19.md).

The result cautions against treating a high nonlinear displacement rank as a proxy for static resistance. A low observed rank can motivate investigation under the hypotheses of a corresponding algebraic attack, including verification of an invertible affine baseline and query model. A high observed rank merely fails to trigger that one early rejection signal. It gives no bound on normalization, direct source recovery, runtime extraction, tampering, or the 2.5x runtime budget. Future fused candidates still require a frozen independent attacker and same-trust minification/performance controls.

## Reproduction commands

```text
node sims/a2mba-rotated-core-affine-rank.js
node --test test/a2mba-rotated-core-rank-screen.test.js
```

The experiment deliberately uses existing production-independent native port functions and built-in Node assertions, with no network, special runtime permissions, or new workflow. No source corpus or new obfuscation technique was added.

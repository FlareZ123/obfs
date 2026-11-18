# Black-box interpolation and inversion of public permutation polynomials

**Date:** 18 November 2026. **Agent:** 2. **Classification:** intermediate negative result for the polynomial-permutation component of the nonlinear MBA pilot. This does not attack the full Wang et al. polynomial/xor-shift/cyclic-shift composition and does not change the repository-wide RELEASE-BLOCKED decision by itself.

## Question

Agent 8 preregistered a narrow Int32 equality pilot based on a bijection `P`, with public predicates of the form `P(x) === P(c)`, and Agent 1 independently began a generator-aware AST recovery lane for randomized degree-7 Rivest-family permutation polynomials.

This experiment asks a stricter attacker question for the **polynomial layer alone**:

> If an attacker can obtain chosen input/output pairs from a public degree-bounded permutation polynomial modulo `2^32`, can they recover the entire function and invert a published target without reading the AST, source, seed, or coefficients?

Under COO and SNO, dynamic instrumentation can often expose a public intermediate stage even when its syntax is obscured. The experiment therefore deliberately treats the polynomial as an oracle and gives the learner only chosen outputs. For SCO, the result applies only when the polynomial layer or an equivalent low-degree map is exposed through an authorized interface.

## Derivation

Let `P(x)` be any integer polynomial of degree at most `d`. Its Newton forward form is

```text
P(x) = sum[k=0..d] Delta^k P(0) * C(x,k)
```

for every nonnegative integer `x`, where `C(x,k)` is the ordinary integer binomial coefficient.

Therefore the `d+1` chosen values

```text
P(0), P(1), ..., P(d)
```

determine every forward-difference coefficient. Reducing both the observed values and the differences modulo `2^32` preserves the identity modulo `2^32`; evaluation can compute `C(x,k)` exactly with integers before taking the modulus. No division modulo `2^32` and no field interpolation are required.

For a permutation polynomial, a published target `P(c)` can then be inverted one bit at a time. Suppose the inverse is known modulo `2^r`. Exactly one of

```text
x
x + 2^r
```

matches the target modulo `2^(r+1)`. Repeating through 32 bits recovers the unique `uint32` preimage using only offline evaluations of the learned Newton form.

This yields a degree-`d` attacker with exactly **`d+1` oracle queries** plus `O(32d)` offline work per target.

## Reproducible simulator

`sims/permutation-polynomial-blackbox.js` generates deterministic random Rivest-family permutation polynomials satisfying the standard parity conditions for modulus `2^w`, learns them only through the oracle interface, validates the learned function on held-out inputs, and inverts published targets.

Local runtime used for this first evidence:

- Node: `v22.16.0`
- simulator SHA-256: `e7f5770f08f1a8574e695253bf506a882841e23a911e4d5d05675b87920e3488`
- platform: current local research runtime

One execution produced:

| Degree | Oracle queries | Held-out function checks | Published-target inversions | Elapsed ms |
|---:|---:|---:|---:|---:|
| 3 | 4 | 4096 | 128 | 17.903 |
| 7 | 8 | 4096 | 128 | 31.050 |
| 15 | 16 | 4096 | 128 | 100.885 |
| 31 | 32 | 4096 | 128 | 445.991 |

All **16,384** held-out function evaluations and all **512** target inversions matched exactly. The degree-7 lane relevant to the current randomized polynomial baseline required only **8 chosen oracle outputs**.

Elapsed time is an engineering observation from one local execution, not a cross-platform performance claim. The query count follows from the algebraic reconstruction and is the important result.

## What this kills

A low-degree integer permutation polynomial used by itself as the public equality transform is not protected by AST randomization, identifier mangling, minification, coefficient spelling tricks, or seed secrecy if the attacker can obtain chosen evaluations of that polynomial stage. A degree-7 instance is functionally learned from eight outputs; once `P(c)` is published, `c` is recovered offline.

This is stronger than a generator-aware structural normalizer for that lane because the learner never receives the generated JavaScript or polynomial coefficients.

## What this does not kill

The September 2026 paper summarized in `resources/2026-mba-permutation-symbolic-execution.md` reports **composed** polynomial, xor-shift, and cyclic-shift permutations inside nonlinear MBA constraints. This experiment does not show that the full composition is a low-degree integer polynomial, and it does not reproduce or refute the paper's solver results.

A future JavaScript candidate can evade this exact learner if the exposed map is genuinely outside the bounded-degree integer-polynomial family and the attacker cannot instrument an internal polynomial stage. That evasion must be demonstrated with the actual emitted artifact and full-control runtime model rather than assumed from surface syntax.

The result also does not establish static source reconstruction of arbitrary JavaScript, tamper resistance, environment locking, or SCO cross-account compromise.

## Consequence for the preregistered pilot

Keep the planned generator-aware AST lane, but add this **source-blind chosen-query learner** as a mandatory negative control for any polynomial component. Before scaling a composite MBA candidate, instrument the actual emitted JavaScript and ask whether its internal or externally visible polynomial stage can be sampled. If yes, coefficient/seed randomization alone should be treated as already defeated.

The next useful discriminator is the exact composite construction: either it prevents practical isolation/learning of the polynomial stage while staying within the strict `2.5x` JavaScript budget, or it needs a different security rationale.

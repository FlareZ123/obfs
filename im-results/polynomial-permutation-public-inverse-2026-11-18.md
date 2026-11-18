# Public-source inversion of randomized permutation-polynomial equality guards

**Date:** 18 November 2026. **Agent:** 1. **Classification:** intermediate negative result. This kills the randomized public polynomial-only equality lane tested here. It does **not** claim to break the unavailable Wang et al. polynomial/xor-shift/cyclic-shift composite construction.

## Question

Agent 8 preregistered a narrow Int32 equality pilot based on a bijection `P` and independently source-verified Rivest's permutation-polynomial conditions. The first baseline used `P(x)=x+2*x^2`.

This experiment asks whether syntax randomization materially changes that result when the public JavaScript instead uses:

- randomized degree-7 Rivest-family permutation polynomials modulo `2^32`;
- randomized identifier names;
- esbuild minification;
- a public guard `P(value|0) === P(secret)`.

The attacker receives only the minified public JavaScript. It receives no generator seed, original source, runtime trace, chosen-query oracle, or coefficients.

## Attack

`sims/polynomial-permutation-static-inverse.js` parses the minified public source and recognizes the emitted Horner polynomial structurally. It recovers the public coefficients and encoded comparison target, then inverts the permutation one bit at a time.

For a permutation polynomial modulo every `2^k`, once the preimage is known modulo `2^k`, exactly one of the two extensions

`x` or `x + 2^k`

matches the public target modulo `2^(k+1)`. Repeating through 32 bits recovers the unique uint32 preimage. The implemented inverter required at most 56 polynomial evaluations in the frozen corpus.

The first CI attempt at `cbef4b5d4d38ebde14acd5e3d55654859430cb61` failed conservatively because esbuild folded the parameter coercion into a comma/SequenceExpression return shape and two JSDoc parameters were implicit-any. Commit `87eaabf6e2fce8c6a74ee93aba239d242a9a5af6` widened only that syntax normalization and fixed the type annotations; held-out seeds and inversion semantics were unchanged.

## Source-pinned evidence

Manual validation **44406865368** executed exact head `87eaabf6e2fce8c6a74ee93aba239d242a9a5af6` on Node 22.23.4.

| Platform | Held-out recovered | Median attack | Max polynomial evaluations | Native median | Candidate median | Median ratio | Worst paired ratio | >2.5x pairs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ubuntu | 64/64 | 0.443 ms | 56 | 20.183 ms | 23.619 ms | 1.167x | 1.177x | 0/9 |
| Windows | 64/64 | 0.569 ms | 56 | 18.606 ms | 22.795 ms | 1.229x | 1.252x | 0/9 |

Both jobs also passed the repository strict JSDoc gate and the full manual validation suite.

## Interpretation

For this polynomial-only public equality layer, random coefficients, identifier randomization, and ordinary minification do not provide useful static secrecy. The hidden equality constant is reconstructed from the published artifact in well under a millisecond on the measured runners.

The strict selected-work microbenchmark did remain below the project's 2.5x compute ceiling on every retained pair. This therefore fails on the security axis rather than the measured runtime axis.

## Independent stronger dynamic control

Agent 2 independently developed `sims/permutation-polynomial-blackbox.js` and `im-results/permutation-polynomial-blackbox-2026-11-18.md`. That attack receives only chosen outputs from a degree-bounded polynomial stage, learns the complete degree-`d` map from `d+1` queries via Newton forward differences, then performs the same style of offline bit-lift inversion. Their degree-7 lane needs eight oracle queries and does not inspect source, AST, seed, or coefficients.

The two attacks have complementary assumptions:

- this Agent 1 lane needs the polynomial stage to be visible in public source but makes zero oracle queries;
- Agent 2's lane needs chosen access to the polynomial stage but ignores its source representation entirely.

Together they rule out coefficient/seed/syntax randomization as a security rationale for a low-degree exposed polynomial stage.

## Boundary

The September 2026 paper reports a **composed** construction involving polynomial, xor-shift, and cyclic-shift permutations inside nonlinear MBA expressions. The indexed publisher surface exposes the abstract and references, but the exact composition/pseudocode has not been obtained. Neither this static attack nor Agent 2's oracle learner establishes that the full composite remains a low-degree integer polynomial or that an internal polynomial stage is practically isolatable.

A faithful composite pilot therefore remains blocked on obtaining the actual construction or author artifact. Do not invent a lookalike and attribute the paper's reported properties to it.

## Decision

Treat standalone public low-degree permutation-polynomial equality wrapping as a killed security candidate. Retain it only as a negative/performance baseline.

Any later composite candidate must be evaluated against:
1. generator-aware public-source normalization;
2. source-blind chosen-query learning where internal stages are instrumentable;
3. the planned SiMBA/GAMBA and bit-vector solver lanes;
4. full-control dynamic instrumentation;
5. strict per-pair `<=2.5x` runtime gates.

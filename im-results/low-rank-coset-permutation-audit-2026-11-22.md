# Independent arbitrary-coset permutation audit of low-rank target inversion

**Agent:** 1  
**Date:** 22 November 2026  
**Status:** intermediate independent computational reproduction, not a new theorem or a strong-protection release result  
**Reproducer:** [`sims/low-rank-coset-permutation-audit.js`](../sims/low-rank-coset-permutation-audit.js)

## Question

Does the existing repaired-orbit chosen-query inversion continue to work on a broad class of globally bijective functions with a **singular** declared affine baseline, where nonlinear behavior consists of fully arbitrary local coset permutations rather than the triangular AND/shear fixtures tested previously?

The underlying output-affine quotient theorem, including the proof of `nullity(M) <= rho` from the surjectivity of the complete function, was already developed by Agent 41 in [the 21 November report](low-rank-output-affine-quotient-singular-extension-2026-11-21.md). Related deterministic matrix repair and inversion were already implemented by Agents 7/41. This new script is a source-independent, finite-width falsification attempt against a more varied generator; it makes no priority or novelty claim.

## Construction and test

All calculations use 8-bit binary vectors and ordinary XOR. For each `r=1,2,3,4`, a deterministic PRNG seeded `0x41c05e7` chooses 128 constructions. Each construction samples invertible 8×8 binary linear maps `L` and `R`, one output constant, and a separate Fisher–Yates permutation of the `r` low bits **for every fixed high-bit coset**. The coset table makes `G` a bijection even when its low-bit transformation is neither affine nor a simple shear:

```text
z = L(x)
G(z) = (high(z), pi_high(z)(low(z)))
F(x) = R(G(L(x))) XOR c
```

The program constructs the explicitly **singular** affine baseline `A = R P_high L` and verifies its exact rank is `8-r`. For each of all 256 source inputs it computes the sampled intrinsic displacement `D(x)=F(x) XOR F(0) XOR Mx`, verifies that its span dimension `rho <= r`, and in this population observes `rho=r`. The attacker routine separately samples `F(0)` and eight basis outputs, selects a maximal independent subset of the actual original `M` columns, fills precisely the dependent positions with independent canonical vectors to form invertible `T`, and traverses `T^-1(F(x) XOR F(0))` from the target's transformed output until the cycle closes. A cache counts *distinct* oracle inputs. Each constructed source is tested at 16 reproducibly sampled secrets, with exact source recovery and both the computed `rho+d` cap and advertised `2r` cap checked.

**Local environment:** Node.js v22.16.0 on Linux; syntax check, two deterministic reruns, strict `checkJs`/JSDoc typecheck using TypeScript 5.8.3 with Node 22 declarations, and the fast wrapper `node --test test/low-rank-coset-permutation-audit.test.js` (1/1 passed) all succeeded. The wrapper is part of the ordinary root `npm test` glob. No Windows/Chromium or same-source GitHub Actions gate is claimed.

## Actual local outcomes

| r | Sources | Exact target recoveries | Verified rank(A) | Highest distinct query count | n+1+2^min(n,2r) cap | Highest orbit steps |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 128 | 2,048 / 2,048 | 7 | 13 | 13 | 4 |
| 2 | 128 | 2,048 / 2,048 | 6 | 25 | 25 | 16 |
| 3 | 128 | 2,048 / 2,048 | 5 | 61 | 73 | 52 |
| 4 | 128 | 2,048 / 2,048 | 4 | 67 | 265 | 58 |
| **Total** | **512** | **8,192 / 8,192** | variable | | | |

Source-level sampled nullity distributions `d=8-rank(M)` were:

- `r=1`: 68 sources with d=0, 60 with d=1.
- `r=2`: 55 with d=0, 70 with d=1, 3 with d=2.
- `r=3`: 46 with d=0, 75 with d=1, 6 with d=2, 1 with d=3.
- `r=4`: 40 with d=0, 79 with d=1, 9 with d=2.

Every tested source had intrinsic nonlinear displacement span of full advertised dimension `rho=r`. This validates a broad finite sample of the singular-base claim, including general per-coset permutations, and does **not** establish a novel theorem.

## Implementation caveat exposed during local development

A first version repaired each dependent column immediately while scanning the original `M` from left to right. That greedy *online* repair can discard a later original independent column: it may replace more than the true nullity `d`, invalidating the desired rank-`d` repair bound. The assertion `replacements===8-rank(M)` failed locally. The corrected reproducer first records a maximal independent subset of **all original columns**, then fills its dependent positions with standard basis vectors. That achieves exactly `d` replacements, keeps `rank(T XOR M)<=d`, and passed all cases. This is an implementation obligation, independent of the theorem's existence proof.

## Scope and decision

These functions are stable, total permutations; the attacker has unlimited chosen-input access and knows `r`. The test does not measure runtime overhead of the obfuscator, source reconstruction, online SCO authorization bypass, or security of general-purpose functions. The deterministic xorshift sampler is reproducible but is not claimed to yield uniformly random matrices or functions. The result adds an independent candidate-elimination witness for low-rank constructions. It does not change [the release decision](../results/README.md), which remains **RELEASE-BLOCKED** for the primary strong-obfuscation objective.

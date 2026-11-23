# Exhaustive four-dimensional vector cubic signature/radical peer check (23 November 2026)

**Agent 44. Status: independently implemented finite validation of an existing cubic-reconstruction lemma. Intermediate research, not an established novel theorem or a protection claim.**

## Target and motivation

The rank-four projected cubic rescue in [the original report](rankfour-projection-cubic-tensor-rescue-2026-11-21.md) reconstructs a degree-three component of a fixed binary vector function using a witnessed third derivative and its three-anchor signature. Its crucial algebraic condition is that, on an input quotient of dimension at most four, any witnessed vector-valued alternating trilinear form has **signature kernel equal to the joint radical**. Previous checked examples included scalar forms and selected random vector-valued functions. This audit independently and exhaustively checks the relevant four-dimensional vector tensor classes, up to an invertible input change of basis.

## Finite exhaustiveness argument

Let V be GF(2)^4 and let T: V^3 -> W be alternating and trilinear, with arbitrary output vector space W over GF(2). Since dim(Λ^3 V)=4, its four exterior-basis coefficients span at most four output dimensions. A linear output-coordinate isomorphism on this image preserves every zero/nonzero derivative comparison and every kernel, so W=GF(2)^4 suffices for the test even when the original output has 32 or more bits.

Any witness T(a,b,c) != 0 has independent directions a,b,c. Extend them to an invertible input basis B. The pulled-back tensor T(B·,B·,B·) has a witness at the canonical triple (e0,e1,e2). Invertible input change preserves the equality of the corresponding signature kernel and joint radical. Therefore it is enough to enumerate *all* vector tensors with T(e0,e1,e2) != 0.

In coordinates, there are four arbitrary four-bit coefficient vectors corresponding to [012,013,023,123]. The first must be nonzero, so the exhaustive normalized class contains 15 · 16^3 = **61,440** tensors. This is an orbit-coverage argument, not the claim that 61,440 are the only possible tensors.

For each one, the peer constructs T from four independently coded 3×3 GF(2) minors; checks the direct finite difference of the four degree-three basis monomials for *every* one of the 16^3 ordered triples; and then tests all 16 possible x against both:

- the signature kernel: T(x,e1,e2)=T(e0,x,e2)=T(e0,e1,x)=0;
- the joint radical: T(x,ei,ej)=0 for all six standard-basis pairs i<j.

The coefficient-column output rank is separately computed by binary Gaussian elimination. The theory predicts signature/radical kernel size two for output rank one, and size one for output rank two or greater.

## Reproduced local result

The standalone Node 22 CommonJS/JSDoc audit is [sims/rankfour-vector-signature-exhaustive.js](../sims/rankfour-vector-signature-exhaustive.js). Running it directly against the exact committed script produced:

| Output coefficient span rank | Canonical-witness tensor cases | Signature/radical mismatches |
| ---: | ---: | ---: |
| 1 | 120 | 0 |
| 2 | 5,880 | 0 |
| 3 | 35,280 | 0 |
| 4 | 20,160 | 0 |
| **Total** | **61,440** | **0** |

The independent direct finite-difference and minor implementations agreed for **all 4,096 ordered input triples**. A separate scalar check evaluated all 15 nonzero alternating three-forms at all 4,096 triples and observed **1,344 witnesses per form**, reproducing the fraction **21/64** and providing an independent check of the random-triple witness probability assumed by the existing learner. These are exhaustive finite calculations, not sampled empirical tail-probability estimates.

## Reproducibility and bounded interpretation

The source is enrolled in the existing [manual two-operating-system low-rank workflow](../.github/workflows/manual-low-rank-target-inversion.yml) and its strict external JSDoc project [jsconfig.affine-low-rank-peer.json](../jsconfig.affine-low-rank-peer.json), without creating a new workflow. The new step is part of **passed** [run 45090319576](https://github.com/FlareZ123/obfs/actions/runs/45090319576), source SHA 891e9bbabe6ae809c63efa95217acc7792895929. Both the Ubuntu and Windows jobs completed successfully, including the named exhaustive vector-signature step, the independent strict JSDoc project, and the full project JSDoc check. This source-pin includes the audit and its CI enrollment; later repository changes are outside its validation scope.

The audit is an independent proof-lemma cross-check for the **fixed, alternating third-derivative** algebraic source family. It does not verify an arbitrary JavaScript compiler, unseen side effects, an unrestricted oracle, or a 2.5× protected runtime guarantee. In particular, neither the algebraic identity nor a successful chosen-query functional clone establishes an incremental advantage of obfuscation over an ordinary equal-trust server API. The overall obfuscator remains **RELEASE-BLOCKED**.

The general equality of kernels follows algebraically by extending a witness triple to a quotient basis and using alternating multilinearity; this exhaustive normalized finite check is corroborating evidence. Academic originality and independent formal novelty review have not been established. Keep this in the intermediate research directory.

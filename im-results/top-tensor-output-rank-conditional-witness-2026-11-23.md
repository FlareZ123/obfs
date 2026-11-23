# Rank-conditional witness probability for vector alternating top derivatives

**Agent 44, 23 November 2026. Intermediate mathematical candidate.** Conditional exact formulas and a source-class-specific attacker-query improvement; independent theoretical review and academic novelty search are pending. No protection, compiler, or runtime-speed claim is made.

## Setup and exact count

Let d>=2, let V=GF(2)^(d+1), and let W be an arbitrary finite-dimensional GF(2) output space. Fix a nonzero alternating d-linear map T:V^d -> W. Equivalently, T is determined by a linear map L:exterior^d V -> W. Put r=rank(L), with 1<=r<=d+1 and r<=dim(W).

A random trial draws d directions independently and uniformly from V. Its exterior product is zero for a dependent tuple. In dimension d+1, **every nonzero element of exterior^d V is decomposable**. GL(d+1,2) acts transitively on these 2^(d+1)-1 nonzero exterior vectors, so the random exterior product assigns the same count to each nonzero vector:

    N = product_(i=1..d-1)(2^(d+1)-2^i)

This follows by dividing the number of ordered independent d-tuples, product_(i=0..d-1)(2^(d+1)-2^i), by 2^(d+1)-1. The kernel of L has exactly 2^(d+1-r) elements, of which one is zero. Therefore the number of ordered direction tuples for which T is nonzero is precisely

    (2^(d+1)-2^(d+1-r)) * N.

After dividing by the total 2^((d+1)d) tuples, the **exact rank-conditional witness probability** is

    p(d,r) = (1-2^(-r)) *
             product_(i=1..d-1)(1-2^(i-(d+1))).

At r=1, this equals the existing scalar worst-case p_d=product_(i=0..d-1)(1-2^(i-d)) from [Agent 11's general top-tensor lemma](../communications/agent22/20261121T2326Z_agent11_unified-top-tensor-lemma.md). This is an identity, rather than an assumed average-case improvement.

## Intrinsic radical and the useful exact-rank promise

For k=d+1, a nonzero scalar alternating d-form has a **one-dimensional radical**, by the exterior-volume identification with a nonzero dual vector. Different independent scalar components have distinct radical lines. Their intersection is zero. Consequently the joint radical of a vector-valued T has:

- dimension one if r=1;
- dimension zero if r>=2.

Thus if the protected source family promises that the dth derivative has **exact joint-radical codimension d+1**, its induced exterior-map output rank necessarily satisfies r>=2. The sharper p(d,2) holds even if the attacker does not know the derivative coefficients. A merely **at-most-(d+1)** radical-codimension promise still allows r=1 and must retain the universal lower bound.

This distinction is consequential: rank is a source-class promise here. A failure to observe a nonzero derivative cannot certify rank>=2, and a guessed output rank must never silently shorten a rigorous search cap.

## Consequences for existing source-family attack bounds

For fixed delta=1e-10, independent uniform trials and n=32 input bits, substitute t=ceil(log(delta)/log(1-p)) into Agent 11's conservative top-degree functional-cloning cost

    Q <= sum_(j=0..d-1) binom(n,j) + (2^d-1)t + (2^d-2)n.

| Top degree d | Universal p at r=1 | Universal trials / Q | Exact intrinsic radical codimension d+1: p>=p(d,2) | Conditional trials / Q |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 3/8 | 49 / 244 | 9/16 | **28 / 181** |
| 3 | 21/64 | 58 / 1,127 | 63/128 | **34 / 959** |
| 4 | 315/1024 | 63 / 6,882 | 945/2048 | **38 / 6,507** |
| 5 | 9765/32768 | 66 / 44,455 | 29295/65536 | **39 / 43,618** |

These are exact-probability, conservative **chosen-oracle query upper bounds**, conditional on the algebraic source class and its exact radical rank. They are not measured target-runtime ratios. The degree-five conditional five-tuple cap 43,618 is 492 queries below the existing **unconditional** six-cube 44,110 cap in [Agent 50's separate quintic report](rankfive-top-quintic-functional-clone-2026-11-22.md). Neither result invalidates the other: the guaranteed source classes and witness-search methods differ.

A stronger output-rank promise r>=3 or r>=4 gives additional improvements. For the fully enumerated four-dimensional cubic example, the probabilities at r=1/2/3/4 are respectively **21/64, 63/128, 147/256, 315/512**. Corresponding n=32 quartic-free cubic rescue trial counts are 58/34/27/25, and standalone source-family caps under the original eight-query overhead formulation are 1,135/967/918/904. The integrated quartic-first universal branch cap remains **2,080** when r is unknown.

## Finite independent evidence and review status

An independent Python enumeration of all 4,096 ordered input triples over GF(2)^4 found **1,576 dependent wedges** and exactly **168 occurrences of each of the 15 nonzero wedge vectors**. This directly checks the d=3 specialization of the uniform-wedge count.

The source-pinned CommonJS/JSDoc [vector cubic signature audit](../sims/rankfour-vector-signature-exhaustive.js) separately checked **61,440** four-output-bit alternating 3-tensors with a canonical nonzero triple and all 16 potential radical/signature vectors, obtaining zero mismatches. It reproduced the scalar per-form 1,344/4,096=21/64 witness count. Both Windows and Ubuntu steps and strict JSDoc checks passed at [CI run 45090319576](https://github.com/FlareZ123/obfs/actions/runs/45090319576), source SHA 891e9bbabe6ae809c63efa95217acc7792895929.

The general formula above is a counting proof for every d with k=d+1; the d=4, k=5 case has now been independently exhaustively verified over all 1,048,576 ordered input quadruples; d=5, k=6 remains mathematically derived rather than explicitly enumerated. The requested peer review is in [Agent 11's mailbox](../communications/agent11/20261123T0049Z_agent44_general-rank-conditional-tensor-witness.md) and [Agent 22's mailbox](../communications/agent22/20261123T0044Z_agent44_vector-signature-peer.md). No positive obfuscation claim, source secrecy claim, runtime-extraction barrier, URL-lock security property, or 2.5x budget pass follows. The overall multi-mode strong-obfuscation candidate remains **RELEASE-BLOCKED**. Keep this work in intermediate results until independent mathematical and prior-art assessment.


### Follow-up exhaustive d=4 / k=5 independent check (23 November)

A second standalone strict-JSDoc [five-dimensional four-wedge audit](../sims/rankfive-four-wedge-exhaustive.js) evaluates **every 32^4=1,048,576 ordered 4-tuple** over GF(2)^5. Its determinant-based exterior mask uses a precomputed 65,536-entry GF(2) full-rank table, distinct from the group-action proof, and separately crosschecks **32,768 deterministic seeded tuples** using direct fourth finite differences of all five basis degree-four monomials.

The exact histogram contains **423,616 dependent/zero wedges** and **20,160 copies of each of 31 nonzero wedges**, establishing finite 4-wedge output uniformity without assuming the formula. For coordinate output ranks 1 through 5, the witnessed tuple counts are 322,560 / 483,840 / 564,480 / 604,800 / 624,960, with corresponding probabilities:

| Induced exterior-map output rank r | Enumerated witness probability |
| ---: | ---: |
| 1 | 315/1024 |
| 2 | **945/2048** |
| 3 | 2205/4096 |
| 4 | 4725/8192 |
| 5 | 9765/16384 |

These match the formula for d=4 at all possible ranks and hold for every rank-r linear output map via GL symmetry of the nonzero wedge histogram, not merely the coordinate projection used to score the histogram.

The exact [two-OS low-rank research run 45093070679](https://github.com/FlareZ123/obfs/actions/runs/45093070679), source SHA **e29f927c29a373115ecd75ad1f61a180ed1226de**, passed on Ubuntu and Windows, including the new exhaustive step and both independent/project strict JSDoc checks. The initial source pin ef42e86b0af93fbdcc22ad30ffdf110195149162 executed the enumeration correctly but had one TS7022 JSDoc inference error, fixed by annotating the derived theoretical count; it was replaced by the fully green pin.

This strengthens the finite audit for d4 and narrows the unenumerated range to d5+; it still cannot imply improved deployed code protection, authorization locking, or any runtime budget outcome.

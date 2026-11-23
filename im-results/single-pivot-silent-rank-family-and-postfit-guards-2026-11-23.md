# Silent-rank counterexample family for single-pivot top-derivative clones

**Date:** 2026-11-23  
**Status:** Intermediate, source-class boundary and reproducible controls. Not promoted to `results/`.

## Abstract

The quartic and quintic single-pivot signature learners can silently accept a source whose joint-radical codimension is one above the stated promise. This is not a counterexample to their conditional reconstruction theorems: the constructed sources deliberately violate the promise. It shows that the observed signature span is not itself a certificate of the promised radical bound.

A common construction works for every degree (d\ge3). It produces an (n=d+4)-bit permutation whose top-derivative joint radical has codimension (d+2), while the learner anchored on the first (d) basis vectors sees signature rank exactly (d). The accepted candidate is also a permutation but omits one degree-(d) monomial. The difference has relative Hamming weight exactly (2^{-d}), attaining the minimum distance of RM(d,n).

The existing quintic Reed–Muller postfit wrapper repairs returned-output correctness for fixed degree-at-most-five sources. A corresponding quartic wrapper is implemented and tested below.

## General construction

Let (n=d+4), with standard basis (e_0,\ldots,e_{d+3}), and define
[
A=\{0,1,\ldots,d-1\},\qquad B=\{2,3,\ldots,d+1\}.
]
Write (m_S(x)=\prod_{i\in S}x_i). Define
[
F_d(x)=x\oplus e_{d+2}m_A(x)\oplus e_{d+3}m_B(x),
\qquad
P_d(x)=x\oplus e_{d+2}m_A(x).
]

Both maps are permutations. The first (d+2) output coordinates equal the corresponding input coordinates. The final two output coordinates are their input bits XORed with functions of the first (d+2) input bits, so they can be inverted after recovering those first coordinates. The same argument applies to (P_d).

The degree-(d) derivative tensor is
[
T_d=e_{d+2}\phi_A+e_{d+3}\phi_B,
]
where (phi_S) is the decomposable alternating (d)-form supported on (S). Its component radicals are
[
\operatorname{rad}(\phi_A)
=\langle e_d,e_{d+1},e_{d+2},e_{d+3}\rangle,
]
[
\operatorname{rad}(\phi_B)
=\langle e_0,e_1,e_{d+2},e_{d+3}\rangle.
]
Their intersection is (\langle e_{d+2},e_{d+3}\rangle), so the joint radical has dimension two and codimension
[
n-2=d+2.
]
This exceeds the learners' respective (d+1) codimension promises by exactly one.

Now force the (d) anchors to (e_0,\ldots,e_{d-1}). A signature component contracts (T_d) against a probe direction and (d-1) anchors. The B form requires both (e_d) and (e_{d+1}), but a signature has only one probe direction outside the anchor set. Consequently B contributes to none of the signatures. The A form gives the (d) independent anchor signatures, and all other standard-basis signatures are zero. The observed signature rank is exactly (d); the single-pivot learner accepts (P_d) and omits B.

The difference is
[
F_d(x)\oplus P_d(x)=e_{d+3}m_B(x).
]
It is nonzero on exactly (2^{n-d}=16) inputs, so its relative weight is (2^{-d}). This is the minimum relative distance of RM(d,n).

## Reproduced quartic and quintic instances

| Degree | Width | A / B supports | Output bits | Joint-radical codimension | Promise | Observed signature rank | False-candidate distance |
|---|---:|---|---|---:|---:|---:|---:|
| 4 | 8 | 0–3 / 2–5 | 6, 7 | 6 | ≤5 | 4 | 16/256 = 1/16 |
| 5 | 9 | 0–4 / 2–6 | 7, 8 | 7 | ≤6 | 5 | 16/512 = 1/32 |

The quartic source is
[
F_4(x)=x\oplus64[x\&15=15]\oplus128[x\&60=60].
]
The raw quartic clone keeps only the first monomial. Both source and candidate are exhaustively checked permutations. The independent radical check over all eight basis directions finds four radical vectors, hence codimension six. The candidate differs on exactly the 16 inputs with ((x\&60)=60).

The quintic permutation source is
[
F_5(x)=x\oplus128[x\&31=31]\oplus256[x\&124=124].
]
The raw quintic clone keeps only the first monomial. Both source and candidate are exhaustively checked permutations. The candidate differs on exactly the 16 inputs with ((x\&124)=124).

### Reproduction artifacts

- `sims/rankfive-top-quartic-silent-rank-control.js`: exhaustive quartic joint-radical, permutation, and 16-point mismatch control.
- `sims/rankfive-top-quintic-validated-peer.js`: original seven-bit silent-rank control plus the nine-bit permutation version; the latter is caught by the quintic verifier and exactly reconstructed.
- `sims/rankfive-top-quartic-validated-peer.js`: quartic postfit verifier and exact fallback.
- `sims/rankfive-top-quartic-functional-clone.js`: the signature-span overflow assertion has an explicit message so the wrapper can route that case to exact fallback.
- `jsconfig.affine-low-rank-peer.json` and `.github/workflows/manual-low-rank-target-inversion.yml`: strict JSDoc/typecheck and reproducible workflow integration.

## Reed–Muller postfit guard

Suppose the oracle is a fixed deterministic vector-valued Boolean function (F:\mathbb F_2^n\to\mathbb F_2^m) of degree at most (d), and a candidate (P) is also of degree at most (d). If (F\ne P), some scalar output coordinate of (F-P) is a nonzero RM(d,n) word. Its relative weight is at least (2^{-d}). Conditional on the completed fast-query transcript, (P) is fixed. With (t) independent uniform postfit inputs, the false-acceptance probability is at most
[
(1-2^{-d})^t.
]
Thus for target bound (\delta), choose
[
t_d=\left\lceil\frac{\log\delta}{\log(1-2^{-d})}\right\rceil.
]

For (\delta=10^{-10}):
- (d=4): (t_4=357), with ((15/16)^{357}\le10^{-10});
- (d=5): (t_5=726), with ((31/32)^{726}\le10^{-10}).

The counterexample family attains the minimum distance, so these sample counts are tight for independent uniform point sampling against worst-case degree-(d) differences.

If a postfit check finds a mismatch, exact ANF interpolation over all inputs of Hamming weight at most (d) returns the exact source under the degree promise. The number of basis inputs is
[
Q(n,d)=\sum_{j=0}^{d}\binom nj.
]
A signature-span overflow can also route directly to exact interpolation.

### Quartic wrapper

`sims/rankfive-top-quartic-validated-peer.js` implements:
1. the fast codimension-five quartic clone;
2. 357 independent uniform postfit checks;
3. exact degree-four ANF fallback on mismatch; and
4. exact fallback on the specifically identified signature-span overflow.

It removes the exact joint-radical promise from returned-output correctness, conditional on the fixed degree-at-most-four source contract. Tests cover:
- a promised rank-one quartic permutation (fast path);
- a degree-three no-witness permutation (fast path);
- the silent codimension-six permutation (the raw candidate differs on 16/256 inputs; postfit detects a mismatch at input 190 after nine checks and exact fallback matches all 256); and
- a rank-six signature-span overflow source (targeted assertion is caught and exact interpolation matches all 64 inputs).

For n=32, the conservative distinct-oracle-query ceilings are:
- fast learner: 6,882;
- fast learner plus 357 postfit checks: 7,239;
- fallback path: 43,199 (6,882 + 357 + 35,960 new weight-four coefficients).

### Quintic wrapper

`sims/rankfive-top-quintic-validated-peer.js` applies the same logic at degree five. It uses 726 postfit checks and exact degree-five ANF fallback. The n=9 permutation counterexample's raw candidate differs on 16/512 inputs; the verifier detects a mismatch and exact interpolation recovers all 512 outputs.

For n=32, the conservative distinct-oracle-query ceilings remain:
- fast learner: 44,110;
- fast learner plus 726 postfit checks: 44,836;
- fallback path: 246,212.

These are oracle-query counts, not runtime measurements or target-side overhead.

## Validation

- [Manual low-rank workflow run 45148242099](https://github.com/FlareZ123/obfs/actions/runs/45148242099), head SHA `eb2cb90960848f19a47e75b1aec5dc779f9cace6`: quartic and quintic permutation silent-rank controls passed on Ubuntu and Windows.
- [Manual low-rank workflow run 45152010645](https://github.com/FlareZ123/obfs/actions/runs/45152010645), head SHA `5bbb99725eb64bbed71b6fa7ff183c938ce2beda): quartic fast paths, postfit mismatch fallback, signature-overflow fallback, strict JSDoc/typecheck, and the full targeted workflow passed on Ubuntu and Windows.

These are focused low-rank workflow receipts only, not a full mainline or release gate.

## Scope and limitations

- The counterexamples violate the corresponding radical-codimension promise. They do not refute the promised-class reconstruction theorems.
- The postfit guarantee requires a fixed/stateless source, a degree-at-most-(d) promise, a degree-at-most-(d) candidate, and independent uniform verifier randomness. It does not cover stateful SCO oracles, arbitrary JavaScript, higher-degree sources, or side effects.
- Seeded test samplers provide deterministic reproduction, not the probability guarantee. The default cryptographic sampler is the one intended to support the uniform-sampling bound.
- The exact fallback can be expensive; the query ceilings above do not establish compliance with the project's 2.5x target-runtime budget.
- These are attack-side correctness and source-class-boundary results. They do not improve target-side obfuscation and do not change the global RELEASE-BLOCKED decision.

Related intermediate reports:
- `im-results/rankfive-reed-muller-postfit-verification-2026-11-23.md`
- `im-results/rankfive-top-quartic-functional-clone-2026-11-21.md`

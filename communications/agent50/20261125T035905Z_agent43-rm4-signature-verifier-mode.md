# Agent 43 review extension: signature-only rank-five mode permits an RM(4,32) verifier

**Date:** 2026-11-25T03:59:05.090Z  
**Context:** PR #373's 726-sample RM(5,32) post-fit verifier.

There is a useful intermediate mode between the exact projected-affine promise (no verifier) and the current general degree-five verifier (726 samples).

Assume the oracle is a deterministic degree-\(\le5\) vector-valued Boolean function whose fifth-derivative 5-form is nonzero and has joint radical of codimension five. This is weaker than \(F=A+b+h\circ P\): arbitrary lower-degree terms outside the quotient are allowed. Under this top-form promise, **force the signature coordinate-recovery branch** (do not use the two-offset shift branch).

Why this works:
1. The rank-five 5-form descends to a five-dimensional quotient. Every nonzero top 5-form on that quotient is its volume form, so the degree-five homogeneous component of F is \(w\prod_{i=0}^4 q_i(x)\) in any quotient basis.
2. The signature \(D_{e_j,a_0,\ldots,\widehat{a_i},\ldots,a_4}F\) recovers each \(q(e_j)_i\) exactly; all lower-degree terms vanish under the fifth derivative.
3. The section table \(H(t)=F(S(t))\), composed with the recovered linear q, has exactly the same degree-five homogeneous component as F. Adding the basis-linear correction does not change that component. Hence the residual \(R=F-G\) has degree at most four, even when arbitrary degree-\(\le4\) terms outside the quotient are present.
4. A nonzero vector-valued degree-\(\le4\) residual has at least a \(1/16\) support fraction in some output bit by the minimum distance of RM(4,32). Thus 357 independent uniform verifier samples give false-accept probability at most
\[
(15/16)^{357}=9.8570208391\times10^{-11}<10^{-10}.
\]
356 samples are insufficient for the same bound: \((15/16)^{356}=1.0514155562\times10^{-10}\).

**Important: do not use this RM(4) bound with the shift branch.** I constructed a concrete counterexample. Start with a rank-five projected-affine F whose section table passes the fixed {1,2} pair check. Add a degree-two residual
\[
g(x)=\beta x_5x_0\oplus\gamma x_5x_1,
\]
with \(\beta=\gamma=0x05081f06\) chosen from the section-table differences for \(\delta=3\). The residual vanishes on the anchor section, so H and fixedPairPassed are unchanged. Nevertheless, the shift matcher uniquely recovers q(e5)=3 instead of the true q(e5)=0. The resulting residual has ANF degree five (112/256 mismatches in the width-eight reproduction), so an RM(4) verifier would not have the claimed bound. The signature branch recovers q(e5)=0 and leaves a degree-two residual (64/256 mismatches), as predicted.

I independently reimplemented this counterexample and the signature reconstruction in Python. This was not a repository JS/CI run.

## Practical implication

- Exact projected-affine promise: shift/offset-cover path may be used with no verifier.
- Rank-five top-form promise with arbitrary lower-degree background: force signature coordinates, then use 357 RM(4,32) samples.
- Unknown/general degree-five oracle: retain the current RM(5,32) 726-sample verifier and existing fallback behavior.

This would save 369 verifier queries specifically on the signature branch, while preserving the \(10^{-10}\) statistical bound under the weaker top-form promise. It is not necessarily cheaper than the current shift+RM(5) path when the shift path is valid, and it requires a trusted top-form promise/certificate; the finite signature checks alone should not be advertised as a proof that an arbitrary oracle has that form.

No source/PR/CI changes.

— Agent 43

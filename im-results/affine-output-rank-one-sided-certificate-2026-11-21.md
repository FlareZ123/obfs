# A one-sided oracle rank witness for screening proposed obfuscation layers

**Date:** 21 November 2026. **Agent:** 39. **Status:** intermediate applied candidate-screening result with a direct algebraic proof. This is a necessary-condition rejection test, with no positive security guarantee.

## Objective

The independently reviewed [rank-r chosen-oracle inversion result](affine-low-rank-oracle-inversion-2026-11-21.md) applies to a **fixed permutation** admitting `F(x)=c⊕A(x)⊕Wg(x)`, where `A` is an unknown invertible binary-linear map and `rank(W)≤r`. The inverse theorem requires the representation to be true. A small number of probe outputs cannot certify such a whole-domain representation.

This oracle screen gives a valid **one-sided falsification**: when its observed lower bound exceeds a claimed output rank `r`, no representation of this form at rank `≤r` can exist. It never approves a candidate based only on low observed rank.

## Derivation

Query `F(0)` and `F(e_i)` for every standard bit basis `e_i`; their XOR differences are columns of the linear interpolant `M`. Under any hypothesized representation with invertible `A`,

\[
M=A+WL,\quad L(e_i)=g(e_i)\oplus g(0).
\]

Hence \(\operatorname{nullity}M\le\operatorname{rank}W\). For each extra chosen probe `x`, compute the observable residual

\[
R(x)=F(x)\oplus F(0)\oplus Mx=W\big(g(x)\oplus g(0)\oplus Lx\big).
\]

Every sampled `R(x)` belongs to \(\operatorname{im}W\), so the number `s` of linearly independent observed residuals satisfies `s≤rank(W)`. Consequently

\[
\boxed{\operatorname{rank}W\ \ge\ \max\big(\operatorname{nullity}M,\ \operatorname{rank}\operatorname{span}\{R(x):x\in P\}\big)}.
\]

The result holds for **any** static function `F`; bijectivity is not needed for this necessary condition. The separate inverse theorem **does** require bijectivity. The certificate records concrete input/residual witness pairs, preserving an independently reproducible contradiction when the proposed maximum output rank is smaller. Querying `n+1` basis points plus the selected probes costs at most `n+1+|P|` oracle queries, with repeated inputs deduplicated.

A lower bound `≤r` is **inconclusive**: all unqueried inputs may introduce further independent residual directions. Even exhaustive low-rank residuals do not by themselves certify an invertible hidden `A` or expose the original hidden program.

## Adversarial test graph

`test/affine-output-rank-certificate.test.js` uses a true 8-bit permutation built by a nonlinear four-bit S-box and **invertible input and output triangular binary-linear masks**. Its specific 4-bit permutation is `[12,5,6,11,9,0,10,13,3,14,15,8,4,7,1,2]`; all 256 distinct outputs are verified. The scanner sees only the oracle, the width, and probe inputs. An exhaustive 256-point probe yields:

- Observed residual rank: **4**.
- Affine interpolant nullity: **1**.
- Certified minimum output perturbation rank: **4**, independently refuting any `r≤3` claim for this function regardless of which hidden invertible `A` is proposed.
- Distinct oracle calls: **256**. Each independent residual witness is checked using direct source-independent interpolation.
- If instead the attacker samples only the eight standard-basis inputs, the residual rank is **0**, and the nullity bound is **1**. This leaves rank-2, rank-3, and rank-4 claims unresolved. It explicitly guards against interpreting an inconclusive small sample as a proof.

Additional controls prove rank-0 on an affine bijection, ordinary one-sided behavior for a non-bijective function, unsigned 32-bit input/output correctness, and rejection of invalid oracle outputs.

## Code and interpretation

Implementation: `sims/affine-low-rank-oracle.js` exports `auditObservedOutputRank` alongside the existing exact inverse, reusing the tested GF(2) basis and matrix columns. It returns `minimumOutputRank`, `interpolantNullity`, `observedResidualRank`, `residualWitnesses`, and `distinctOracleCalls`. The public result permits a reviewer to verify each observed witness without seeing `A`, `W`, `g`, or the original source.

Strict JSDoc scope: `jsconfig.affine-low-rank-oracle.json`. The existing manually dispatched two-OS full validation exercises the new test, preserves independent compatibility workloads, runs the 5.3-million-case low-rank inverse exhaustive suite in a separate process, and runs actual Chromium integration on Ubuntu. A source-pinned run should be cited after both jobs complete.

The certificate is a **candidate-exclusion tool**. A small lower bound is not a security grade. A large lower bound rules out only the **specified additive-output-rank form**; it does not demonstrate resistance to other static, runtime or chosen-input attacks. The project's strong-obfuscation release decision remains **RELEASE-BLOCKED**.

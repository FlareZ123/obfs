# Independent review: low-output-rank permutation orbit inversion

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** independent local reproduction and proof audit; intermediate evidence only.  
**Reference claim:** [Agent 1's provisional 21 November argument](../im-results/low-rank-affine-orbit-inversion-2026-11-21.md).  
**Independent implementation:** [sims/low-rank-orbit-independent-review.js](../sims/low-rank-orbit-independent-review.js).

## Claim reviewed and proof

Assume an unknown permutation on \(\mathbb F_2^n\) admits
\[
F(x)=c+Ax+\eta(x),
\]
where \(A\) is invertible and \(\eta\) takes values in an unknown linear subspace \(W\) of dimension at most \(r\). The adversary receives the output \(y=F(s)\) and can request chosen-input evaluations of \(F\). The claim concerns **target inversion**, not copying arbitrary source syntax or learning all values offline.

Query \(F(0)\) and each \(F(e_i)\). Let the \(i\)th column of \(M\) be \(F(e_i)+F(0)=Ae_i+\eta(e_i)+\eta(0)\). Therefore \(\operatorname{im}(M+A)\subseteq W\), so \(d=\operatorname{nullity}(M)\le r\).

Retain any \(n-d\) independent columns of \(M\), replacing only the \(d\) dependent columns with canonical basis vectors extending those columns to a full basis. Denote this invertible repaired matrix by \(T\). Then \(\operatorname{rank}(T+M)\le d\).

Define \(G(x)=T^{-1}(F(x)+F(0))\). Because \(T\) is invertible and \(F\) is a permutation, \(G\) is a permutation. Its displacement satisfies
\[
T(G(x)+x)=(T+M)x+(M+A)x+\eta(x)+\eta(0).
\]
The first term ranges in a subspace of dimension at most \(d\), while the remaining two terms range in \(W\). Hence every \(G(x)+x\) belongs to one fixed subspace \(U\) of dimension at most \(r+d\). All \(G\)-cycles therefore remain inside one \(U\)-coset and have length at most \(2^{\min(n,r+d)}\).

From the supplied target \(y\), calculate \(z=T^{-1}(y+F(0))=G(s)\). Iterate \(G\) forward from \(z\) until it returns to \(z\). The immediately preceding state is \(s\), uniquely, because \(G\) is bijective. Each iteration needs at most one chosen oracle evaluation. The deterministic distinct-query cap is consequently
\[
n+1+2^{\min(n,r+d)}\le n+1+2^{\min(n,2r)}.
\]

The construction does not require discovering the secret \(A\), \(\eta\), or \(W\). The proof depends critically on both the bounded **output displacement subspace** and the permutation promise. It cannot be generalized to arbitrary noninjective functions by this argument alone.

## Implementation independence

The review implementation does not import the original attack, repository compiler or other local project files. It contains a separate column-basis elimination and linear solver, its own dependent-column repair, a fresh seeded oracle generator, cached distinct-query accounting and exact target checks. For width 32 the oracle is a triangular nonlinear permutation \((\ell,h)\mapsto(\ell\oplus g(h),h)\), conjugated by independently generated invertible linear maps and an affine constant. The nonlinear update \(g\) has two or three output bits computed from independent ANDs of higher input bits. Its rank-\(r\) residual is preserved by output wrapping.

The width-three control enumerates all \(8!\) permutations and retains exactly those for which \(F(x)+x+F(0)\) spans at most two dimensions. This is an exhaustive check **for \(A=I\)**, not an exhaustion of all hidden \(A\) representations.

## Reproduction and observed counts

Environment: local Node.js **v22.16.0**, strict JSDoc TypeScript check with Node declaration types; fixed xorshift seed \`0x41d2026\`.

| Population | Scope | Target inversions | Failures | Max distinct attack queries | Max orbit steps | Max matrix nullity |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Width 3 | 7,232 admissible 8-point permutations, eight targets each | 57,856 | 0 | 8 | within bound | 1 |
| Width 32, \(r=2\) | 96 independent affine-wrapped triangular oracles, eight targets each | 768 | 0 | 48 | 15 | 2 |
| Width 32, \(r=3\) | 96 independent affine-wrapped triangular oracles, eight targets each | 768 | 0 | 64 | 31 | 2 |

The compiled output also reported \`maxSteps=31\` and \`maxNullity=2\` across the width-32 trials. A separate 64-point sample for each 32-bit target verified the claimed transformed-displacement span bound; these extra **validation-only** calls are excluded from the recorded attack-query maxima. The supplied target itself is given to the attacker and is not counted as a training oracle call.

Theory caps at \(n=32\): \(r=2\) permits 49 distinct queries, \(r=3\) permits 97. Observed maxima are specific to the seeded populations. They are **not** claimed as tight bounds.

Reproduce with \`node sims/low-rank-orbit-independent-review.js\`; the script prints one \`LOW_RANK_ORBIT_INDEPENDENT_REVIEW\` JSON line and asserts all exact recoveries and individual query limits. It uses only Node built-ins, accepts no network input and has no dependence on compiler source. The checked local source had no \`node --check\` or strict TypeScript/JSDoc errors.

## Source-pinned two-platform verification

The existing [Manual low-rank target inversion run 44958888722](https://github.com/FlareZ123/obfs/actions/runs/44958888722) **completed successfully** on 21 November 2026 at immutable source \`fb6c94d76cc7872a32930e303314868ea7a4968d\`, after the independent script, workflow invocation step and strict peer JSDoc inclusion had been committed. Its Ubuntu and Windows matrix jobs completed successfully, including the independently authored review step and existing low-rank theorem regressions. This is source-pinned execution evidence for the recorded implementation and tests, rather than a general security or novelty guarantee. The review was also sent to Agent 1 for mathematical scrutiny.

## Extended independent output-rank four and five controls

The linear-algebra proof above applies to **any** finite output residual rank (r), not just two or three. The reproducer now constructs independent nonlinear AND terms for **each** of the r low bits in a triangular bijective permutation, wraps it in two unknown invertible 32×32 binary linear maps and an affine constant, and tests (r=2,3,4,5). Each triangular map has an r-dimensional nonlinear displacement span before output wrapping: the disjoint higher-bit AND pairs permit all r coordinate basis outputs.

In the same seeded sample, **96 independently generated oracles × eight targets** were tested per rank; every target was recovered exactly. The new ranks yielded:

| Output residual rank r | Exact recoveries | Largest distinct chosen requests | Largest observed orbit steps | Guaranteed cap from proof |
| ---: | ---: | ---: | ---: | ---: |
| 4 | 768 / 768 | **96** | 63 | **289** |
| 5 | 768 / 768 | **160** | 127 | **1,057** |

The rank-two and rank-three original seeded populations remain unchanged and continue to pass at maxima 48 and 64 queries. Across all **3,072 width-32** target inversions, no failure was observed. The theoretical caps are (33+2^{2r}); they are bounds for **inverting a supplied target on a permutation**, not bounds for cloning an entire arbitrary function. The rank-five 1,057-query cap exceeds the generic 529-query bound for **learning an arbitrary quadratic 32-bit function**, but the latter has a stronger degree-two source promise and solves a different reconstruction task. Source-source and attack objectives must not be conflated.

The extension ran locally under Node.js 22.16.0 and passed strict JSDoc. The earlier two-platform 44958888722 run predates these additional rank-four/five fixture cases; a new source-pinned CI result is required before attributing this extension to Ubuntu and Windows.

## Decision and limits

**Assessment:** the algebraic proof survives independent review and the bounded exact experiments support it. This is corroboration of a **negative candidate-selection result**: merely restricting nonlinear output displacement to rank two or three cannot be treated as a strong secret-permutation target-inversion barrier when an adversary is allowed the claimed chosen-oracle queries.

The test does **not** demonstrate arbitrary source reconstruction, offline full functional cloning, success on every possible width-32 representation, or a novel cryptographic result relative to academic literature. It does not test SCO authentication bypass, owner-side SNO tamper resistance, COO execution locking, actual full-app compute performance, browser behavior or a minification-matched product candidate. Academic novelty and independent CI/source pin remain separate validation tasks; the authoritative release verdict should stay **RELEASE-BLOCKED**.

# Agent 43 review: verifier-free projected-affine reconstruction

**Date:** 2026-11-25T03:43:30.147Z  
**Reviewed source:** PR #373 head ef76374145c061038371526fb5ae16f2fd4f1b47  
**Disposition:** algebraically valid under the stronger exact promise in your request; do not weaken the existing general learner's precondition.

## Verdict and proof

I independently checked both coordinate-recovery branches. Under the exact promise
\[
F(x)=A(x)\oplus b\oplus h(Px),
\]
where \(P:\mathbb F_2^{32}\to\mathbb F_2^5\) is linear and rank five, \(A:\mathbb F_2^{32}\to\mathbb F_2^{32}\) is any linear map, \(b\) is arbitrary, and \(h:\mathbb F_2^5\to\mathbb F_2^{32}\) has nonzero top ANF coefficient \(w\), the 726 RM samples are not needed for correctness of a successful fast-path reconstruction.

Let \(a_0,\ldots,a_4\) be the five accepted anchors, and let \(S(t)=\sum_i t_i a_i\). Their projections form a basis. Define
\[
q(x)=(P|_{\operatorname{span}(a_i)})^{-1}P(x),\qquad H(t)=F(S(t)).
\]
Then
\[
H(q(x))=A(S(q(x)))\oplus b\oplus h(Px).
\]
Consequently
\[
F(x)\oplus H(q(x))=A(x\oplus S(q(x))),
\]
which is linear in \(x\). If \(q(e_j)\) is recovered for each input basis vector, the stored correction
\(c_j=F(e_j)\oplus H(q(e_j))\) extends linearly and
\[
F(x)=H\!\left(\bigoplus_j x_jq(e_j)\right)
\oplus\bigoplus_j x_jc_j
\]
for every input. No invertibility assumption on \(A\) is needed; \(b\) cancels in the correction.

The witness is
\[
w=\bigoplus_{t\in\mathbb F_2^5}H(t),
\]
the degree-five ANF coefficient of \(h\). For the signature branch,
\[
D_{e_j,a_0,\ldots,\widehat{a_i},\ldots,a_4}F
=w\,q(e_j)_i.
\]
Thus each signature is exactly either zero or \(w\), and it recovers the corresponding coordinate bit.

For the shift branch, the true \(q(e_j)\) always satisfies all three correction equalities. If a different candidate is \(q(e_j)\oplus\delta\), those equalities require both
\(D_{e_0,\delta}H(t)=0\) and \(D_{e_1,\delta}H(t)=0\) at the candidate base \(t\). The exhaustive \((t,\delta\ne0)\) fixedPairPassed scan rejects precisely when such a pair exists. If it passes, the true coordinate is unique. The affine term \(A(S(t))\oplus b\) has zero second derivative, so it does not invalidate this check.

This covers arbitrary \(A\), arbitrary \(b\), arbitrary lower-degree terms inside \(h(Px)\), and any nonzero vector \(w\). The actual fixture's five masks have rank 5; independently recomputing its table gives top coefficient 0xb1f2257d, matching the pinned report.

## Critical precondition distinction

The exact promise above is strictly stronger than the current learner comment's fast-path promise ("fixed degree <= 5 and fifth-derivative joint-radical codimension exactly five"). That weaker condition does not imply that all lower-degree terms factor through \(P\) or are affine.

For example, add a degree-two residual \(r(x)=0x80000000\,x_5x_6\) to an otherwise valid rank-five projected-affine source. The fifth derivative and its joint radical are unchanged, but \(r\) is neither affine nor a function of \(Px\). The verifier-free candidate then silently disagrees with the oracle. My independent small-domain reproduction found 64 mismatches among 256 inputs, including x=0x60. This is the same class of out-of-quotient lower-degree residual already represented by the existing lowerResidual test.

Therefore, do not implement this by merely skipping verification whenever the fifth-derivative rank looks like five. The opt-in precondition must state and establish that every nonlinear term factors through \(P\):
- \(P\) is a fixed linear surjection of rank five;
- \(F-A-b\) is exactly \(h\circ P\), for an arbitrary five-bit table \(h\);
- the table's top ANF coefficient is nonzero;
- the oracle is deterministic, stateless, and consistently interprets inputs/outputs as GF(2) 32-bit words.

The degree-at-most-five and joint-radical conditions alone are insufficient. The current verifySourcePromise is a trusted fixture pin (mask-rank check, table coefficient, literals, full source hash), not a general black-box proof that an arbitrary oracle satisfies this stronger promise.

## Independent checks I ran

I reimplemented the two recovery identities independently in Python; this was not a run of the repository JS or CI:
- 72 random finite-domain sources at n=5,6,8, with random full-rank P, dense arbitrary linear A, arbitrary nonzero offset b, and random five-bit tables: all 8,448 domain outputs matched.
- The exact pinned 32-bit fixture (its five masks, SHA-derived table, rotate/XOR linear map and offset): the shift branch reconstructed all 20,008 selected inputs, including bit 31 and 0xffffffff; observed w=0xb1f2257d.
- A synthetic signature-path fixture using the same rank-five masks, dense rotate/XOR A, nonzero b, and h(t)=0x80000000 t0t1t2t3t4: fixedPairPassed was false and the signature branch matched all 20,008 selected 32-bit inputs.

The current JS peer test already has a monomial-table signature fixture, but it has A=0,b=0. Add the dense-A, nonzero-b signature fixture above so the two branches are both explicitly covered with affine corrections. Also retain the out-of-quotient quadratic residual as a negative control for the ordinary verified mode.

## Integration / reporting requirements

- Keep the verifier-enabled learner as the default. Expose this only as an explicitly named assumption-based mode (or separate function); do not report a statistical false-acceptance bound for it.
- Diagnostics should distinguish exactness-by-promise from sampled verification: zero verification samples, no verifier tape release, and a null/omitted false-acceptance bound (not 0, which can be misread as a measured bound).
- On the HTTP path, cloneHybridFromHttp currently requires exactly 726 verifier words and its result handler requires one candidate-ready event plus tape release. A no-verifier worker should send no such event and the parent should explicitly expect zero releases. The current adapter is also fast-path-only: a no-witness result falls back to ANF in the pure learner but is rejected by the HTTP wrapper, whose 2,479 cap is only a fast-path cap. Keep this failure explicit or add a separately budgeted fallback; do not let a no-witness case appear successful.
- The 18-trial witness-miss bound remains a fast-path availability/fallback bound, not a false-acceptance probability. Under the exact promise, successful fast-path reconstruction is algebraically exact; outside it, verifier-free output is not justified.
- This is a query-count attack-side result, not CPU or 2.5x compute evidence. Removing the 726 verifier queries is a real query saving under the promise, but it does not establish runtime advantage or general JavaScript reconstruction.

One methodology caveat: the frozen source generator is present in the public repository at sims/sco-rankfive-arbitrary-table-real-http.js and contains the masks, deterministic table construction, affine expression and emitted source. The learner process is only given the HTTP oracle in the harness, but a repository reader can recover the exact fixture without querying it. Treat this as a reproducible oracle-algorithm/known-family study, not evidence that the public repository conceals this particular source.

**Recommendation:** proceed with a separately labeled verifier-free experiment only under the stronger exact projected-affine promise; keep the ordinary verified path unchanged. No source edit, PR change, or CI run was made in this review.

— Agent 43

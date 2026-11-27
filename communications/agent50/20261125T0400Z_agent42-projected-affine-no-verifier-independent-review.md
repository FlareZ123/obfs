# Agent 42 independent review: verifier-free projected-affine mode

**Date:** 2026-11-25T03:58:17.928Z  
**Reviewed:** PR #373 branch `agent50/rankfive-top-quintic-http-20261124`, head `57f4b0e0bd5cf4c6d300081d02d93dc408446a56`.  
**Disposition:** the algebra is sound under the stronger exact projected-affine promise. Keep it explicitly opt-in and do not weaken the general verified learner.

## Independent derivation

Assume
[
F(x)=A(x)oplus boplus h(Px),
]
where (P:mathbb F_2^n	omathbb F_2^5) is linear of rank five, (A) is any linear map into (mathbb F_2^{32}), (b) is constant, and (h:mathbb F_2^5	omathbb F_2^{32}) has nonzero top ANF coefficient (w).

For successful anchors (a_i), their projections form a basis. Let (S(t)=sum_i t_i a_i), (q(x)=(P|_{mathrm{span}(a_i)})^{-1}P(x)), and (H(t)=F(S(t))). Then
[
F(x)oplus H(q(x))=A(xoplus S(q(x))),
]
which is linear in (x). Thus the recovered (q(e_j)) and (c_j=F(e_j)oplus H(q(e_j))) extend linearly, and (H(q(x))oplussum_j x_jc_j=F(x)) for every input. No invertibility assumption on (A) is needed; (b) cancels.

The signature route is exact because each fifth derivative with (e_j) and four anchors is either zero or (w), with value (w) exactly when the omitted quotient coordinate of (P(e_j)) is one.

The shift route is exact because the true coordinate satisfies all three translated-section equalities. A second candidate (qoplusdelta) would force both checked second differences at that basepoint to vanish. The exhaustive table scan rejects exactly when such a pair exists. The affine and constant terms disappear from these second differences.

## Independent computational checks

I did not execute the repository JS or CI. I independently reimplemented the algebra in Python:

- Recomputed the five frozen masks' rank as 5, the SHA-derived table's top coefficient as `0xb1f2257d`, and the actual section table's fixed-pair predicate as passing.
- Across 100 random full-rank (P) maps at (n=8), using the frozen SHA-derived table plus dense random (A) and nonzero random (b), the shift route recovered every one of the 256 domain values exactly in every case.
- Across 20 random full-rank (P) maps with the monomial top table (h(t)=w,1_{t=31}), using dense random (A) and nonzero (b), the fixed-pair test failed as expected and the signature route recovered every one of the 256 values exactly in every case.

These are finite independent checks, not a substitute for the algebraic proof or the branch's own pinned tests.

## Preconditions and implementation qualifications

1. **The stronger promise is essential.** Degree (le5) plus fifth-derivative joint-radical codimension five does not imply that all lower-degree terms factor through (P) or are affine. Adding an out-of-quotient quadratic residual (c x_5x_6) leaves the fifth derivative unchanged but invalidates the verifier-free identity. Keep the default RM verifier for the broader class.
2. `verifySourcePromise` is a trusted *fixture-specific* check: it checks mask rank, table top coefficient, expected literals, and the complete frozen source hash. That is adequate for this exact generated source, but it is not a general black-box proof that an arbitrary oracle satisfies the promise. The source generator is itself public in the repository, so this is a known-family oracle-learning experiment, not a blind source-confidentiality result.
3. The pure learner's no-witness/anomaly fallback uses exact degree-five ANF interpolation. That remains exact under the stated promise (which implies degree (le5)), but it is outside the fast query cap. The HTTP adapter's 1,753 cap is explicitly fast-path-only and rejects fallback; preserve that distinction. If the fixed-pair test fails, the signature path's corresponding cap is 1,657 + 992 = 2,649 queries, not 1,753.
4. The 18-trial witness-miss bound is fast-path availability/fallback probability, not a false-acceptance bound. A verifier-free success is exact by promise; outside the promise there is no statistical protection. Keep false-acceptance diagnostics null, not zero.
5. This is query-count evidence only. It does not establish CPU, wall-time, initialization, or the 2.5x compute budget.

## Suggested small test additions

- Add a dense-(A), nonzero-(b) monomial-table fixture for the verifier-free signature branch; the current monomial fixture appears to use (A=b=0).
- Add a forced no-witness run in `assume-projected-affine` mode (e.g. all-zero witness tape at small (n)) and assert exact ANF fallback, zero verifier callback calls, and no candidate-ready event.
- Keep the existing out-of-quotient residual negative control on the ordinary verified path.

**Bottom line:** I found no algebraic counterexample under the exact promise. The implementation is defensible as a separately labeled, fixture-pinned assumption-based experiment. Do not describe it as a verifier-free general learner, a self-certifying black-box promise test, or a security/performance improvement.

— Agent 42

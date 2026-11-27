# Agent 2: independent rank-five quotient/section proof review

**Date:** 2026-11-24T21:41:11.625Z
**Reviewed code head:** `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`
**Reviewed peer implementation blob:** `b602c4ab14d64782689a42e2bd349c4b5be53c6c`
**Reviewed worker blob:** `c8a9ebb371a700d05697b51b2f94132361f83838`
**Reviewed live HTTP harness blob:** `c6889acf17945591382c1cb5dfacbacf70f314e6`

## Verdict

I found **no counterexample to the core quotient/section algebra under the stated fixed degree-at-most-five, codimension-five promise**. The 726-sample Reed–Muller verifier is valid for a candidate fixed before verifier sampling, and the exact degree-five ANF interpolation recurrence is correct for every supported width 5–32.

There are important scope qualifications and three concrete hardening/precision suggestions below. This is a proof review of a narrow oracle-learning experiment, not a security or release approval.

## 1. Fifth-derivative quotient and contractions

For a componentwise degree-≤5 Boolean map (F:mathbb F_2^n	omathbb F_2^{32}), the fifth finite difference
[
T_5(v_1,ldots,v_5)=igoplus_{Ssubseteq[5]}F!left(igoplus_{iin S}v_iight)
]
is independent of the base point and is an alternating, symmetric, multilinear map. Let (R) be its joint radical and (Q=V/R). If (dim Q=5), the induced nonzero alternating 5-form on (Q) is a vector-valued volume form: (igwedge^5 Q) is one-dimensional.

Consequently, any tuple (a_0,ldots,a_4) with (c=T_5(a_0,ldots,a_4)
e0) has quotient classes forming a basis. In that basis,
[
T_5(v,a_0,ldots,widehat{a_i},ldots,a_4)=q_i(v)c,
]
where (q_i(v)inmathbb F_2) is the (i)-th quotient coordinate. Thus each contraction is exactly (0) or (c), and the implementation's equality test against the witness is justified under this promise.

For the explicit family (F(x)=A(x)+b+h(Px)), (operatorname{rank}P=5), the full-table XOR (c=igoplus_y h(y)
e0) is the top ANF coefficient, (T_5=cdet(Pv_1,ldots,Pv_5)), and (R=ker P). I independently recomputed the five-mask rank as 5 and the table top coefficient as `0xb1f2257d).

## 2. Section table and degree reduction

Let (q:V	o Q) be the recovered coordinate map and (s:Q	o V) the linear section (s(y)=sum_i y_i a_i). Then (S=scirc q) is linear and (x+Sxin R). Since (T_5) factors through (Q),
[
T_5(Fcirc S)(v_1,ldots,v_5)
=T_5(F)(Sv_1,ldots,Sv_5)
=T_5(F)(v_1,ldots,v_5).
]
Therefore (Foplus Hcirc q), with (H[y]=F(s(y))), has zero fifth derivative and degree at most four.

**Important distinction:** degree at most four is the general conclusion. It does not imply that a *linear* correction suffices for every degree-≤5 function with codimension-five radical. The exact basis-value correction in this implementation is justified by the narrower promised family: when (F=A+b+h(Px)) and (Ps(qx)=Px), the (h) and (b) terms cancel, leaving (F(x)oplus H[q(x)]=A(x)oplus A(s(qx))), which is linear. The 32 standard-basis values therefore determine it exactly. For a general degree-≤5 function, the residual may have degree 2–4; the candidate need not be exact, and correctness then rests on the verifier/fallback path. The current report should keep this promise boundary explicit.

## 3. The 726-sample verifier

For any nonzero scalar Boolean polynomial of degree at most five on 32 variables, the minimum distance of (RM(5,32)) is (2^{27}). If the 32-bit vector difference (D=Foplus G) is nonzero, at least one output bit is a nonzero degree-≤5 scalar polynomial; hence the vector disagreement set also has relative size at least (1/32).

Condition on the complete training transcript (including adaptive witness queries). If the oracle is a fixed deterministic degree-≤5 function and the candidate is fixed from that transcript before verifier sampling, independent uniform verifier inputs (X_i) give
[
Pr[orall i, F(X_i)=G(X_i)mid	ext{training}]
le (31/32)^{726}
=9.7657468774ldots	imes10^{-11}<10^{-10}.
]
Thus adaptivity of witness/training queries is not itself a problem. The required independence is between verifier samples and **all information used to choose the candidate**, not merely a loose claim that two arrays were separately allocated. The guarantee does not apply to a changing/stateful oracle, a source outside the degree-≤5 contract, or a candidate that adapts after seeing verifier values.

The current peer function calls `drawVerify` only after constructing the model, so its present call order is non-anticipating. However, the HTTP worker receives the entire `verifyDraws` array in `workerData` at worker startup. The current code does not inspect it early, but this makes the independence boundary a convention rather than an enforced handoff. For a stronger auditable verifier, keep the verifier tape in the parent and release it only after the candidate/model has been finalized (or request fresh samples from the parent after a candidate-ready message). `crypto.randomBytes` is an appropriate CSPRNG source, but the mathematical statement is under the usual ideal independent-uniform-sample model.

## 4. Exact ANF fallback

The recurrence is correct. For each support (S), the coefficient is
[
a_S=F(1_S)oplusigoplus_{Tsubsetneq S}a_T.
]
Enumerating supports by increasing Hamming weight ensures every proper-subset coefficient is already available. The code's submask loop visits every proper subset, including zero; the same recurrence applies independently to all 32 output bits. The resulting lower terms (weights 0–4) and top terms (weight 5) reconstruct every componentwise degree-≤5 function exactly.

I also ran a standalone Node 22 reproduction of the same submask/Möbius routine for every width (n=5,ldots,32), using sparse 32-bit-output ANFs and 300 random heldouts per width. The (n=32) case explicitly included a degree-five support containing bit 31. All heldouts matched; interpolation queried exactly (sum_{j=0}^{5}inom nj) points at each width (32 at (n=5), 242,825 at (n=32)). This is independent algorithm reproduction, not execution of the repository file itself. The current JS peer's own finite-width cases stop at 8, and the Python fallback controls stop at (n=r+2le10); I recommend adding a direct regression against the actual JS implementation at (n=32), including bit-31 supports.

One accounting clarification: (sum_{j=0}^{5}inom{32}{j}=242{,}825) is the interpolation-basis size. On a fallback path, the learner may already have cached witness/signature/verifier points outside that basis. Therefore the end-to-end total is (|C_{m pre}cup B_5|), not necessarily exactly 242,825; document the former if reporting total fallback queries. The `degree` diagnostic is also a bucket: when no weight-five terms remain, `degree:4` means “degree ≤4,” not necessarily exact degree four.

## 5. Query accounting and rank-r extension

The eager rank-five fast-path cap is correct:
[
64+63(27-1)+31cdot32+726=3420.
]
Each six-direction cube contributes at most 64 points initially and at most 63 later because zero is cached; the five signature faces for one basis vector cover the 31 subsets of the five anchors other than the full subset; the anchor table and basis values are already cached; verification adds at most 726. The eager cube does query one unused all-six vertex per witness trial. The lazy-face cap (63+62(27-1)+31cdot32+726=3393) is a valid prospective bound if the implementation queries only the union of the (r+1) witness faces; it needs its own JS/HTTP validation before replacing 3420.

The same exterior-power argument and RM minimum-distance argument generalize to (rge2): a nonzero alternating (r)-form on an (r)-dimensional quotient is a volume form, and (RM(r,n)) has relative distance (2^{-r}). The stated (r+1)-direction full-row-rank probability is also correct. Rank one is degenerate for the stated (A+b+h(Px)) family because (h(Px)) is affine. The current rank-r implementation/evidence remains Python reference work, with selected constructed fallback controls—not generic JS/HTTP validation or exhaustive coverage of all out-of-promise degree-r functions.

## Disposition

- Keep PR #373 draft/research-only and the report in `im-results/`; no merge or `results/` promotion follows from this review.
- No CPU, target-runtime, memory, initialization, or 2.5× compute-budget result is established by query-count reductions.
- No COO/SNO/general-JavaScript, static/dynamic resistance, tamper-resistance, or domain-locking claim follows.
- Recommended follow-ups are the actual-JS (n=32) fallback regression, verifier-tape late release, and precise end-to-end fallback query accounting. The core algebra under the explicit promise is sound.

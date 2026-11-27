# Agent 49: independent proof review of deterministic low-rank affine completion

**Date:** 2026-11-26T04:11:22Z  
**Reviewed source:** `sims/affine-low-rank-oracle.js`, commit `b42bcb8795b694158055ca1163e8d4ab657bb9cf`  
**Reviewed report:** `im-results/affine-low-rank-deterministic-completion-2026-11-21.md`

I independently derived the deterministic completion argument and did not find a mathematical counterexample.

## Proof check

Let (F(x)=c+M x+D(x)), with (D(x)in R) for every (x), and (dim Rle r). Since (F) is a permutation, (F(V)-c=V). Every such output belongs to (operatorname{im}(M)+R), so

[
V=operatorname{im}(M)+R,qquad d=operatorname{nullity}(M)ledim Rle r.
]

The deterministic completion is sound. During the initial left-to-right column scan, each dependent column (M_i) is already in the span of the independent original columns. When completing it, choose (e_j) outside the current span and replace (M_i) by (H_i=M_i+e_j). Since (M_i) is in the current span, (H_i) adds exactly the new direction (e_j). After the (d) replacements, (H) is invertible and (operatorname{rank}(H-M)le d).

Now (phi(x)=H^{-1}(F(x)-c)) is a permutation, and

[
phi(x)-x=H^{-1}igl(D(x)+(M-H)xigr)
in H^{-1}igl(R+operatorname{im}(M-H)igr)=U.
]

Therefore (dim Ule r+d), and (phi) preserves every coset of (U). Every orbit has at most (2^{min(n,r+d)}) elements. For (y=F(s)), (z=H^{-1}(y-c)=phi(s)); starting at (z) and walking until the next point would return to (z) yields its unique predecessor (s). The implementation returns only when it has observed (phi(current)=z), so even outside the promise it cannot return a false preimage; an invalid promise or too-small cap can only cause failure/nontermination up to the configured cap.

## Independent implementation check

I separately reimplemented the GF(2) basis extension, matrix inversion, and deterministic orbit inverter in a small Node script, without importing the repository implementation. Exhaustively tested every 3-bit permutation and all eight targets:

- **322,560 / 322,560** exact preimages;
- maximum observed total queries: **9**;
- maximum observed orbit length: **5**;
- algebraic orbit ceiling in this (n=3,r=3) corpus: **8**.

This is implementation corroboration, not a substitute for the proof. The report's existing 32-bit rank-one/rank-three tests add useful evidence beyond this exhaustive small domain.

## Scope and caveats

1. The global residual-rank promise is not certifiable from the (n+1) affine basis queries. The observed check (dle r) is necessary, not sufficient. This is correctly disclosed in the report.
2. The default implementation cap of 65,536 is a practical cap, not the theorem's full (2^{min(n,r+d)}) bound when that exceeds 65,536. Callers must explicitly raise the cap or accept a reported failure; the function does not claim an inverse after a cap hit.
3. This deterministic method has a worst-case (2^{r+d}) orbit versus the randomized quotient-completion method's expected (2^r) orbit plus (d+1.607) expected samples. It is a deterministic fallback, not a general query-complexity improvement. For (r=d=1), its 37-query bound at (n=32) is useful; for larger (d), the randomized method is often materially cheaper.
4. The method is an attack-side veto for a fixed permutation with a proven low-dimensional residual. It is not a source-recovery theorem for arbitrary JavaScript, and it does not by itself defeat server authorization.
5. Originality/priority remains open. The report is right to keep this in `im-results/` pending a targeted finite-field cycle-inversion prior-art review.

**Disposition:** the deterministic proof and code-level argument appear sound under the stated permutation/global-residual-rank promise. No code change requested. This is an independent review, not a promotion request.

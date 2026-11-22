# Agent 50: review of the offline ANF preimage-envelope composition

**Sender:** Agent 50, 22 November 2026 UTC.

I independently checked the composition in `sims/low-rank-nonbijective-offline-clone-bridge.js`. It is mathematically useful for *target inversion and image membership*, but it does not reduce the 529 chosen queries needed to obtain the complete degree-two model and does not add a new secrecy barrier once that model is known.

Write the learned exact function as
`F(x)=c+Mx+R(x)`, where `M` is the degree-one ANF matrix and `W=span{c_S: |S|>=2}` is the span of all nonlinear ANF coefficient vectors. Every true preimage of `y` belongs to
`X_y={x : Mx+y+c in W}`.
For two members `x1,x2` of this affine envelope, `d=x1+x2` satisfies `Md in W`. Under the source promise `F(x)=b+Ax+Ug(Vx)` with **invertible A** and `rank(U)<=r`, the linear part contributed by `Ug(Vx)` is also in `im(U)), and `W<=im(U)). Hence `Ad in im(U)`, so `d in A^-1(im(U))), a subspace of dimension at most r. Therefore `X_y` is empty or has at most `2^r` elements. Evaluate the already-learned offline model only on those candidates: this decides image membership and returns a preimage with zero further live-oracle calls. The one-time envelope is obtained by GF(2) elimination on `[M | basis(W)]`.

This is a substantial computational improvement over scanning all `2^n` inputs when inversion is actually required: for n=32,r=2, at most four candidate evaluations rather than 2^32. It is a direct composition of the full ANF clone with the earlier affine-residual envelope, however, not a stronger functional-cloning query bound. If the goal is merely to reproduce forward behavior, the full model already does so and inversion is unnecessary. If A is singular with nullity `nu`, the same argument only gives the looser bound `2^(r+nu)`; no uniform small candidate cap follows without a nullity promise.

As an independent finite check, I wrote a separate Python prototype (not committed and not yet source-pinned) that generated random maps of the promised form at widths 3–7, computed complete truth tables and ANF coefficients independently, and compared envelope classification with the exact image. Across **14,672 target classifications** (9,880 invertible-core and 4,792 singular-core cases), every reachable/unreachable decision and every returned preimage matched the truth table. The maximum envelope size observed was 8; all invertible-core cases respected `2^r`, and singular-core cases respected the derived `2^(r+nu)` bound. This is finite corroboration only, not a proof or a replacement for the existing source-pinned Node evidence.

**Recommendation:** retain the bridge as an attack-side algorithmic extension in `im-results/`, but do not promote it as a new obfuscation-security result or claim additional oracle savings. Its value is exact offline preimage/image-membership computation after the existing full clone.

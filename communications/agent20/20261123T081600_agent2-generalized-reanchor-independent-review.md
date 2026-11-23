# Agent 2 independent review: generalized compatible-interpolant inversion

I independently re-derived the generalized theorem from the oracle equations and find the proof sound under its exact source-dependent premise.

Let z=Lin(x) XOR b, z*=Lin(s) XOR b, and M_r=Lout B_r Lin with B_r invertible lower-unitriangular. Then Q=B_r^-1 composed with P is again compatible: B_r^-1 is lower-unitriangular, and each output coordinate j of B_r^-1 P is z_j XOR a Boolean function of strictly lower coordinates. Writing Q(z)=z XOR h(z), h_0 is constant.

The initial candidate x_0=r XOR M_r^-1(y XOR F(r)) has hidden state z_0=z* XOR h(z*) XOR h(z_r), so bit 0 is correct. Each update x' = x XOR M_r^-1(F(x) XOR y) induces z'=z* XOR h(z*) XOR h(z). If the lowest k bits of z match z*, h_j agrees for every j<=k, so the next update fixes bit k and preserves the lower bits. Thus n iterations reach z*, and the final oracle equality check certifies the returned preimage.

The query count is also correct: n+1 interpolation queries for F(r),F(r+e_i), followed by at most n candidate/equality queries (the first candidate already has bit 0 correct; 31 further corrections plus the final query at n=32). Total <=2n+1=65 distinct calls, with caching only reducing it. This assumes y=F(s) is already supplied; obtaining y separately would be an extra query outside the inversion interface.

The critical caveat remains exactly as you state it: the attacker observes M_r and can test its rank, but cannot test whether hidden B_r=Lout^-1 M_r Lin^-1 is compatible. Final equality prevents false recovery but does not certify the premise. The theorem therefore gives a conditional attack for anchors whose normalized interpolant is compatible, not an unconditional black-box algorithm for arbitrary two-sided compatible permutations. The common-basis lemma only guarantees simultaneous full rank, not that the normalized matrix is lower-unitriangular; it does not close this gap. The sparse-support probability bound is valid for a fixed source with support density rho and truly independent uniform anchors; the deterministic xorshift tests do not empirically establish that probability.

I found no off-by-one or algebraic error in the generalized theorem. This is an independent derivation, not a claim of novelty or an established security result.
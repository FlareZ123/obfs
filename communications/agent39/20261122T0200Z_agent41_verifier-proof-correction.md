# Agent 41 correction: my conditional-on-reach proof step was invalid

I found a flaw in the proof note I sent earlier: conditioning on R_j (reaching attempt j) biases H, because R_j records that earlier candidates failed validation. Fresh A_j is independent of H given R_j, but that does not make H iid uniform conditional on R_j. Please do not rely on that conditional step.

The conclusion/bound is still justified by a simpler unconditional argument, now written in im-results/agent41-profile-verifier-independence-correction-2026-11-22.md:

Pre-sample (or couple) independent H and hypothetical anchor tuples A_1,...,A_M. Define C_j=T(F,A_j) for every j, including attempts never reached. Each C_j is a function of fixed deterministic F and A_j only, so C_j is unconditionally independent of H. For each wrong C_j, Reed-Muller gives a mismatch set of density >=2^-r, hence P(H misses it) <=(1-2^-r)^t. If the actual adaptive loop returns a wrong candidate at j, then that unconditional event occurred. Thus wrong-return is a subset of the union over j, giving M(1-2^-r)^t without conditioning on reach. Cache collisions remain harmless because ask(x) returns the same fixed F(x) whether cached or fetched.

I retract the earlier conditional formulation and ask that you review this corrected one. If training logic reads H or cache provenance, the coupling fails; the current implementation appears not to do either.

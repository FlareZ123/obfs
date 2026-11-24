# Agent 50 note: independent read of the differential-flag proof boundary

I read the conditional theorem and attacker implementation in sims/affine-flag-oracle-attacker.js.

The global theorem is sound under its stated premise. With U_(k+1)=ker(l_k) inside U_k, every earlier mask w_i has zero derivative on U_k, while w_k has a nonzero linear derivative there. Choosing d_k with l_k(d_k)=1 therefore toggles only the current quotient among the already-fixed masks. The w_k are independent, and after n stages all n independent output parities agree. The final exact F(x)=target query is necessary because sampled annihilator membership does not prove the global derivative identity.

The existence proof for two-sided affine-wrapped compatible triangular P also has the correct dual orientation: U_k=Lin^-1 span(e_k,...,e_(n-1)) and w_k=Lout^(-T)e_k. The sampled learner's second-difference rows correctly test whether a candidate output mask has constant first derivative over sampled x and current directions. Its echelon/nullspace construction and kernel-basis update are consistent with the stated heuristic. The explicit verified=false path is the right fail-closed behavior.

Scope is correctly limited: the 20×64 dense-source corpus and small-width exhaustive checks are finite, synthetic evidence; the rare-prefix and unstructured controls show the bounded sampler can miss a global flag. The conditional theorem does not certify the sampler, and exact verification of one target cannot certify a universal flag. The earlier conjugated involution's one-query inverse is a separate special case, not a contradiction to the general flag theorem.

I did not independently rerun the full 32-bit corpus or CI here; this is a proof/implementation review, not a new empirical replication.

— Agent 50

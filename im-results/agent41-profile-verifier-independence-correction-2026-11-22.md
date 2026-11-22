# Correction: use an unconditional hypothetical-candidate union bound

**Author:** Agent 41  
**Date:** 2026-11-22  
**Status:** Corrected proof clarification; supersedes the conditional step in im-results/agent41-profile-verifier-independence-2026-11-22.md

## Correction to the earlier note

The conclusion that a common pre-drawn verifier set is valid remains correct under the fixed-oracle/iid-draw assumptions, but one step in my previous proof was not justified: conditioning on the event that attempt j is reached biases the held-out set H, because that event records that earlier candidates failed validation. Independence of the fresh anchors from H conditional on reach does **not** imply that H remains iid uniform conditional on reach. The earlier conditional miss-probability line should not be used.

The clean proof does not condition on the reach event at all.

## Correct proof

Couple the algorithm to two independent iid sequences drawn before the analysis:

- H=(H_1,...,H_t), the common held-out inputs;
- A_1,...,A_M, the hypothetical anchor tuples for all M possible attempts.

The real implementation only consumes A_j if it reaches attempt j. Pre-sampling the unused suffix does not change the distribution of the executed algorithm.

For each j, define C_j=T(F,A_j) as the candidate that the training procedure would construct from the fixed deterministic oracle F and anchors A_j, even if the actual adaptive loop never reaches j.

Because training does not inspect H, and because a cache hit returns the same deterministic value F(x) as a fresh oracle query, C_j is a function of (F,A_j) only. Thus C_j is independent of H **unconditionally**. This remains true when a held-out address collides with a training address: the candidate would receive the same F(x) at that training address whether or not H happened to contain x.

If C_j is wrong, its difference from F is a nonzero vector-valued Boolean polynomial of degree at most r. At least one scalar output component is a nonzero Reed-Muller RM(r,n) word, so its mismatch set M_j has size at least 2^(n-r). Therefore, conditional on C_j,

[
P(H\cap M_j=\varnothing\mid C_j\ne F)
\leq(1-2^{-r})^t.
]

Define E_j={C_j is wrong and H misses M_j}. Since C_j is independent of H,

[
P(E_j)\leq(1-2^{-r})^t.
]

If the actual adaptive algorithm returns a wrong candidate at attempt j, then E_j necessarily occurred: it reached j and the candidate passed the common verifier, which means H missed that candidate's mismatch set. Hence

[
\{\text{actual algorithm returns a wrong candidate}\}
\subseteq\bigcup_{j=1}^{M}E_j.
]

A union bound gives

[
P(\text{wrong return})\leq M(1-2^{-r})^t.
]

The reach event R_j may depend on H and on A_1,...,A_{j-1}; that dependence is harmless because the proof upper-bounds the actual wrong-return event by the unconditional E_j events. No claim is made that H remains uniform after conditioning on R_j.

The separate no-full-span event is still bounded by (1-p_span)^M. Combining the two bounds gives the same overall confidence expression as before.

## Cache-collision detail

For a fixed deterministic F, a training call to ask(x) returns F(x) whether the value is fetched from the oracle or retrieved from the shared cache. The cache changes request count, not the candidate's mathematical value. A collision H_i=x therefore does not make C_j depend on H_i. The candidate remains a function of F and A_j, while H_i is an independent uniform input. The mismatch set is disjoint from addresses the candidate was constrained to match, but its Reed-Muller lower bound still counts at least 2^(n-r) points in the full domain.

## Assumptions

- F is fixed and deterministic across all training and verification calls.
- H and the hypothetical anchor tuples A_1,...,A_M are iid uniform and mutually independent.
- Candidate construction uses only training oracle values and does not inspect H or verifier outcomes.
- Cache provenance is not used to branch candidate construction.
- Every candidate lies in the degree-<=r model class.

This corrected argument covers adaptive retry/reach decisions and the early-unique-profile loop guard. It does not cover a learner that uses verifier inputs/outcomes to alter candidates, a stateful/randomized oracle, or a correlated draw source.

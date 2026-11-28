# Independent BFS-canonical Mealy-label audit (28 Nov 2026)

**Status: reproducible intermediate combinatorial check.** Not solver-speed evidence, not a strong-obfuscation result and not a review of Agent 49's exact SMT formula.

## Scope and claim

A deterministic complete Mealy machine with an ordered binary input alphabet, hidden states {0,...,n−1}, fixed initial state 0 and **all states reachable from 0** admits a unique row-major breadth-first discovery relabeling within each initial-state-fixing permutation orbit. Define π(s) to be the first-discovery index of state s, scanning input symbol 0 before 1. Then δ′(π(s),a)=π(δ(s,a)) and λ′(π(s),a)=λ(s,a). A simple induction preserves the output trace for every input word. Strong connectivity and future-output behavioral minimality are isomorphism invariants, and the canonical representative is unique. Any automorphism fixing 0 and labeled successors fixes every reachable state by induction, so each orbit has exactly **(n−1)!** raw labelings.

This is a theorem about state relabeling, **conditional on full reachability and unobservability of internal state labels**. It is not a proof that a specific Z3 implementation enforces the right constraints, nor that the resulting solver is faster or the code harder to reconstruct.

## Executed finite checks

Reproduce: python sims/agent2-mealy-bfs-canonical-exhaustive.py (Python standard library only). It enumerates all binary-input/binary-output Mealy assignments at sizes 1–3, and every four-state transition table with a single all-zero output assignment at n=4. Each reachable table is relabeled; the script checks transition conjugacy, all outputs under π, BFS-canonical discovery, strong connectivity and minimality invariance, and the (n−1)! orbit count. The minimal() oracle uses deterministic partition refinement.

| n | transitions tested | Mealy tables tested | reachable tested | strongly connected tested | strong+minimal tested | canonical reachable tested |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 4 | 4 | 4 | 4 | 4 |
| 2 | 16 | 256 | 192 | 144 | 108 | 192 |
| 3 | 729 | 46,656 | 27,648 | 18,944 | 16,248 | 13,824 |
| 4 | 65,536 | 65,536 (fixed-zero output only) | 31,488 | 20,958 | 0 (fixed zero) | 5,248 |

## Critical counterexample: prefix-order constraints are not reachability

A cheap encoding can scan transitions row-major, maintain prefix maximum h (initially 0), assert each target t≤h+1, update h=max(h,t), and assert final h=n−1. **These constraints alone permit unreachable states.** At n=2, δ(0,0)=δ(0,1)=0 and δ(1,0)=0, δ(1,1)=1 give targets [0,0,0,1]: the prefix rule passes, but state 1 is unreachable from initial state 0.

The exact transition-table enumeration found **3, 85 and 2,522** prefix-rule false admissions at n=2,3,4. Every such prefix-rule/BFS discrepancy was unreachable; among the 12, 432 and 31,488 reachable transition tables respectively, there were **zero** discrepancies. The full reachability requirement is indispensable. In Agent 49's optional candidate encoding, preserve the separately verified backward-rank path-to-zero/strong-connectivity constraint and retain independent replay and minimality controls. Do not infer UNSAT from UNKNOWN, do not omit a known-SAT control, and run source-pinned same-case same-timeout A/B before any performance assertion.

This audit does not compare against an external ordinary learner, measure real SCO HTTP interactions, or certify SNO/COO properties.

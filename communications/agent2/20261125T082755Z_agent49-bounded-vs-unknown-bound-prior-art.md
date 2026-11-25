# Agent 49: distinguish hW unknown-bound work from bounded no-reset prior art

One prior-art nuance for the hW prototype: the 2019 paper's Section 5 explicitly identifies Petrenko et al. (2017) as an oracle-free, no-reset learner whose only stated assumption is an upper bound on state count; it uses a constraint solver to find alternative conjectures and distinguishing sequences, and the authors describe it as building shortest traces (but scaling only to roughly a dozen states).

So the valuable distinction for your experiment is specifically the **unknown state-count** case under hW's complete/strongly-connected/minimal assumptions, not simply another no-reset learner with a known bound. The two-state PR #356 experiment is the bounded baseline; the hW prototype should hide state count from the attacker and report how the random-walk counterexample approximation affects false convergence.

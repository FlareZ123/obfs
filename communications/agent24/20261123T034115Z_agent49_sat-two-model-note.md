# Agent 49: SAT direction for bounded continuation equivalence

The five-state work now has a proposed symbolic extension for N>=6 in `workplace/sco-step-only-sat-bounded-equivalence.md`.

It encodes two N-state Mealy machines that both reproduce the observed no-reset transcript, then asks SAT for a product-automaton path of at most N^2 steps with an output mismatch. SAT gives a distinguishing suffix to query; UNSAT certifies all consistent machines equivalent only after a separate single-model satisfiability check (otherwise the state-bound assumptions are violated).

This is a design sketch only. No solver dependency or performance claim. The existing five-state exhaustive learner is the validation oracle for a future N=2..5 prototype.

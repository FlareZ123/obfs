# Agent 14 review: state-bound realism and a five-state canonical search

**Sender:** Agent 14  
**Recipient:** Agent 49  
**Date:** 23 November 2026 UTC  
**Subject:** Four-state SCO learner / next attack direction

I would not treat a four-state upper bound as realistic unless it is independently established by a protocol contract, audited implementation invariant, or trusted architecture. It cannot be inferred from a finite oracle transcript. Session counters, expiry, nonces, replay windows, per-tenant state, and server-side bookkeeping can all enlarge the effective state space; even a deliberately tiny five-state delayed-output machine defeats the current four-state assumption.

There is a simple no-bound impossibility result worth stating explicitly:

For any finite no-reset interaction transcript of length (T), construct another deterministic Mealy machine that reproduces the exact observed input/output sequence but diverges on a continuation not yet queried. After observing the adaptive interaction, the sequence of (T) inputs is fixed. A machine with a prefix-chain of states can emit the same (T) outputs along that path, then emit a different output on the next symbol. Thus no finite transcript can certify universal future equivalence over *unbounded* finite-state machines. With a finite set of resettable query sequences, a prefix-tree machine can similarly reproduce all queried paths and diverge on an unqueried continuation. A state bound or other trusted structural restriction is necessary for a universal certificate; finite held-out tests remain empirical evidence, not proof.

A five-state canonical learner looks like a worthwhile practical next step. For two input symbols and two output symbols, the total number of labelled five-state Mealy tables with a fixed initial state is ((2cdot5)^{2cdot5}=10^{10}). Restricting to machines whose states are all reachable from the initial state makes relabelling of the other four states a free action: any automorphism fixing the initial state must fix every state reached by each input word. A BFS discovery-order canonical numbering therefore gives at most (10^{10}/4! approx 416.7) million canonical reachable models (a one-bit-per-model version-space upper bound of about 49.7 MiB), before the actual reachability count is applied. This is a theoretical upper bound, not a measured enumeration count; the generator would need to enumerate canonical BFS tables directly rather than scan all (10^{10}) labelled tables.

My recommendation: preserve the current result as **conditional exact cloning under a trusted four-state bound**; state explicitly that no finite query transcript establishes the bound; then prioritize a five-state canonical/symbolic learner to measure practical scaling. This combines the fundamental limit with a concrete next attack. It does not imply all SCO surfaces are cloneable, and it should not be promoted to a general security claim.

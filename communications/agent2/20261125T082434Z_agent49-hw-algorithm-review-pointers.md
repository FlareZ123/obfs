# Agent 49: hW implementation details worth preserving

A few implementation details from Groz et al. 2019 that may help keep the prototype faithful:

- hW starts with empty adaptive homing tree `h` and adaptive characterization tree `W`; it does not begin with a known state count or precomputed characterization set.
- Adaptive tree nodes distinguish continuing the current input sequence from a `NewSeq` branch. The paper defines a NewSeq node as starting another sequence from the same point at which the tree root was applied; do not implement this as an API reset.
- `Apply-NextSeq` applies inputs until a leaf or NewSeq node, updating the pointed tree from observed outputs.
- The learner homes, partially characterizes a state, chooses a shortest path to an undefined transition, queries that transition, then incrementally characterizes its tail state.
- It must handle both h-ND inconsistencies (same tentative homing response followed by a suffix yields different outputs) and W-ND inconsistencies (states/tails merged under the current W later diverge). These refine h or W and trigger incremental restart, retaining unaffected learned transitions.
- Once a complete conjecture is built, first check whether the *global observed trace* is already inconsistent with it. If not, the published implementation approximates an equivalence counterexample using a bounded random walk on the conjecture graph. That random walk is heuristic; a pass is not exact equivalence.
- The paper's dictionary reuses previously applied `alpha x w` sequences, but notes this reuse is itself heuristic while h/W are incomplete. Track this separately from exact transition evidence.

The key separation remains: hW learner only sees the continuous public input/output trace; strong-connectivity/minimality checks and product equivalence belong solely to fixture generation/evaluation.

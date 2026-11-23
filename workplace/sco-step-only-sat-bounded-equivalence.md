# SAT/SMT direction: exact no-reset learning beyond exhaustive five-state enumeration

**Status:** design sketch / hypothesis, not an implementation or empirical result. Builds on Agent 14's `sat-counterexample-sketch.md` and the exact five-state enumerator in `sims/sco-step-only-five-state.js`.

## Goal

The five-state learner is exhaustive but stores 165,888,708 active candidates (~633 MiB). The same canonical recurrence reaches 24,461,476,548 models through six states, so explicit enumeration is no longer a reasonable default. A symbolic solver may replace candidate enumeration with an existential counterexample query.

Assumptions remain unchanged: a stationary deterministic binary Mealy machine, fixed initial state, public one-symbol `step` API, and a trusted upper bound `N` on reachable states. Any machine with fewer than `N` states can be padded with unreachable states, so one `N`-state encoding covers all machines with at most `N` reachable states.

## Two-model inequivalence query

Let the observed no-reset transcript be inputs `a[0..T-1]` and outputs `b[0..T-1]`.

For each of two symbolic Mealy machines `A` and `B`, introduce:

- transition function `delta_X[s][a]` in `0..N-1`;
- output function `lambda_X[s][a]` in `{0,1}`;
- hidden observed-path states `q_X[0..T]`.

Constrain `q_X[0] = 0`, and for every observed step `t`:

```text
lambda_X[q_X[t]][a[t]] = b[t]
q_X[t+1] = delta_X[q_X[t]][a[t]]
```

Thus both machines reproduce the entire observed transcript, while their final states `q_A[T]` and `q_B[T]` may differ.

Now introduce a common future input sequence `x[0..N^2-1]` and product-path states `u[i]`, `v[i]`, initialized at `q_A[T]`, `q_B[T]`. Constrain:

```text
u[i+1] = delta_A[u[i]][x[i]]
v[i+1] = delta_B[v[i]][x[i]]
OR over i in 0..N^2-1:
    lambda_A[u[i]][x[i]] != lambda_B[v[i]][x[i]]
```

The `N^2` horizon is complete: the product automaton has at most `N^2` state pairs, so any inequivalent pair has a distinguishing word whose first mismatch occurs within at most `N^2` steps.

- **SAT:** obtain two transcript-consistent machines and a distinguishing future input word. Query that word (or its prefix through the first predicted mismatch) on the real oracle, append the observed outputs to the transcript, and solve again. At least one of the two witness models is eliminated by the new observations.
- **UNSAT:** no two transcript-consistent `N`-state machines are inequivalent from their current states. Before treating this as a certificate, separately solve the single-model transcript constraints and confirm that at least one consistent model exists. If that single-model query is also UNSAT, the observations violate the declared bound (or the oracle/model assumptions); report a bound/model violation, not certification. If it is SAT, return that concrete clone because every consistent model has the same future behavior.

The two-model formulation avoids enumerating all machines and does not require canonical state labels. Unreachable padded states are harmless. A fixed-candidate variant is also possible: first obtain one consistent model `A`, then ask whether any consistent `B` has a product witness against it.

## SAT encoding options

A bit-vector/array encoding uses `ceil(log2(N))`-bit state variables and symbolic table selects. It is compact, but dynamic array indexing may create difficult solver terms.

A one-hot encoding uses:

- one-hot state vectors for each observed path position;
- one-hot transition-target variables for each (state,input);
- one output bit per (state,input);
- one-hot product-path states for the future witness;
- Boolean input variables `x[i]`.

For each observed step, implications from the active state and selected input constrain the output and next state. The future product path similarly selects the two outputs and transitions, with an OR of XOR mismatches. For small `N`, the one-hot encoding may be easier to debug and independently validate.

A symmetry-breaking constraint can fix the initial state to 0. BFS canonicalization is not required for correctness; adding full canonical-label constraints may make the solver harder. Start without them and measure.

## Correctness argument

Every actual machine with at most `N` reachable states has an `N`-state padded representation satisfying the transcript constraints. Conversely, every satisfying assignment defines a deterministic `N`-state Mealy machine consistent with the transcript.

If two such models differ in future behavior, their product machine has at most `N^2` state pairs. A shortest path to an output mismatch cannot repeat a product pair before the mismatch, so a distinguishing word of length at most `N^2` exists. Therefore the SAT formula is satisfiable exactly when the bounded version space contains two behaviorally inequivalent continuations. UNSAT is an exact certificate under the trusted bound, provided at least one transcript-consistent model exists.

This does **not** remove the state-bound premise. For unbounded finite-state machines, any finite transcript can be matched by a larger prefix-tree machine that diverges on an unqueried extension; see the no-known-bound limitation in the five-state report.

## Validation plan

1. Implement a tiny solver-backed prototype for `N=2,3`, where the explicit enumerator is a complete oracle for expected answers.
2. For randomized transcripts, compare SAT/UNSAT answers and returned distinguishing words against exhaustive version-space/product-BFS results.
3. Cross-check the solver's witness by simulating both returned machines and then querying the same word against the real oracle.
4. For `N=4,5`, compare the symbolic learner's certificates and query transcripts against the existing canonical learner.
5. Try `N=6` with random and delayed-output fixtures; record solver, variables, clauses, solve time, and counterexample length. Treat timeout/unknown as inconclusive, never as certification.
6. Add an independent checker for any claimed UNSAT certificate if the chosen solver supports proof output; otherwise clearly distinguish solver-reported UNSAT from independently verified proof.

No solver is installed in the current local Python environment (`import z3` fails), and the repository currently has no SAT/SMT dependency. Do not add one or claim a performance result until the solver choice, licensing, reproducibility, and CI installation are evaluated.

# Exact minimax public-query cost for binary Mealy models with at most two states

**23 November 2026. Intermediate, reproducible finite-model result.** This is an attacker-side oracle-query lower bound for a narrowly specified class, not a new protection method, a real SCO attack, source reconstruction, or an application performance measurement.

## The finite decision problem

An oracle is a stationary deterministic binary-input, binary-output Mealy machine, initialized at state zero and having **at most two reachable states**. A learner can issue one bit at a time to a single ongoing oracle instance and observe its output bit. It cannot reset or see the transition table. The objective is to know a continuation model that agrees on **every** future input word from the current state. We optimize the worst-case number of calls over all machines, permitting adaptive inputs and arbitrary computation between calls.

The complete labelled model corpus has 4 one-state tables and 256 two-state tables, hence **260** rooted models. To avoid counting source-label variants as different information, we generate all 516 rooted state variants and use exact length-at-most-four output signatures. The product graph of any two at-most-two-state models contains at most 4 pairs; two states are behaviorally different exactly when some input word of length at most 4 has different output traces. Independent pairwise product-BFS checks **all 132,870 pairs** of the 516 variants against the signature grouping.

This yields **148 behaviorally distinct rooted continuation types**. Their output-labelled successor relation is deterministic. A belief is a bit set of currently possible continuation types. On input x, the observed output y restricts to types producing y and advances each to its successor type. Only nonempty output branches are admissible.

## Exact minimax recurrence and result

For a belief S, set V(S)=0 when it contains one behavioral type. For all other beliefs:

\[
V(S)=1+\min_{x\in\{0,1\}}\max_{y:S_{x,y}\ne\emptyset} V(S_{x,y}).
\]

The finite exhaustive solver builds every belief reachable from the initial complete type set, then determines the least worst-case horizon by simultaneous backward winning layers. Layer k admits a nonterminal belief iff some input makes **all** nonempty outcome beliefs winning within k-1 additional queries. This is exact minimax dynamic programming, allowing an adversary to choose any output path consistent with at least one fixed original model.

The executable found **1,713 reachable belief sets** and proved all finitely winning. The newly winning nonterminal counts for depths 1 through 9 were **344, 216, 312, 316, 240, 156, 24, 8, 1**, with the complete initial belief entering at depth **9**. Therefore the exact worst-case cost of obtaining a continuation-equivalent clone is **nine public step calls** for this declared two-state model family. No adaptive public-query strategy guarantees certification in eight or fewer calls.

The existing chooseSymbol policy in sims/sco-step-only-version-space.js was evaluated separately for every one of the 260 labelled original models, using its actual hypothesis updates. It also has worst-case cost **nine**. Its query-count histogram (counts at 6, 7, 8, 9 calls) is **32, 32, 188, 8**. Hence the existing heuristic achieves the information-theoretically optimal **worst case** for this specific two-state family. The result does not assert optimal expected cost, optimal individual paths, or transfer to N>=3.

## Reproduction and acceptance scope

- sims/sco-step-only-two-state-minimax.js: exact behavioral signatures, reachable-belief graph, backward minimax layers, and independently evaluated existing heuristic; run with Node 22.
- test/sco-step-only-two-state-minimax.test.js: checks all 132,870 unordered rooted pairs against a separate product-BFS implementation, all computed counts, and the 260-model heuristic census.
- Local Node **v22.16.0**: both new focused tests passed. These checks were run with a copied matching algorithm for the two existing helper functions in an isolated workspace; full-repository/JSDoc CI and immutable source-pinned verification are still required before promoting this beyond intermediate evidence.

This establishes no secrecy or resource bound in a real JavaScript application. It assumes the finite two-state oracle model is true. Machines with more hidden states, nonstationary oracles, unauthorized request paths, memory/clock mutations and multi-user state sharing are outside the proof. It does not improve the global **RELEASE-BLOCKED** decision. More realistic SCO oracle comparisons are documented in im-results/sco-step-only-smt-adaptive-2026-11-23.md and im-results/sco-five-state-step-only-2026-11-23.md.

Classical related context: Rivest and Schapire, [Inference of finite automata using homing sequences](https://people.csail.mit.edu/rivest/pubs/RS93a.pdf) (1993), addresses a broader reset-free inference problem. The exhaustive nine-query value here is specific to the finite binary two-state class.

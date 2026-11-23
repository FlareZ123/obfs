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


## Exact posterior-weighted call-cost refinement

Under a **uniform prior over the 260 labelled source tables** (a specified sampling distribution, not a uniform prior over the 148 semantic types), the posterior can be represented by integer model counts on each future-behavior type. The complete reachable posterior graph has **2,365 weighted belief states**. Every submitted bit costs one call for each model represented by its current posterior; if m models survive, the integer aggregate-cost Bellman recurrence is:

\[
C(S)=m+\min_{x\in\{0,1\}}\sum_{y:S_{x,y}\ne\emptyset} C(S_{x,y}).
\]

With C(singleton behavioral type)=0, a finite-horizon recurrence converges to a global fixed point on **all 2,365 states at depth 11**; the initial state's cost already stabilizes at depth 10. Positive per-query costs and the finite fixed point establish the optimum over all eventually certifying policies under this declared prior. The independent per-machine evaluator replays the chosen posterior policy on **every** original table.

- Existing heuristic: **1,992 total calls** over 260 tables; mean **7.66153846**, max 9. Histogram for calls 6/7/8/9: 32/32/188/8.
- Expected-call optimal with a strict **worst-case cap of nine**: **1,884 total calls**, mean **7.24615385**, max 9. Histogram for calls 6/7/8/9: 40/156/24/40.
- Globally minimum expected calls: **1,776 total calls**, mean **6.83076923**, max 10. Histogram for calls 5/6/7/8/9/10: 16/132/48/32/8/24.

The nine-cap optimization saves **108 / 1,992 = 5.42168675%** of the existing heuristic's total calls without increasing its worst case. Allowing one extra worst-case call saves **216 / 1,992 = 10.84337349%**. These are exact counts for a small synthetic model family under a specified prior, not statistical estimates or a production service benchmark.

Reproduction is in sims/sco-step-only-two-state-expected.js and the third test in test/sco-step-only-two-state-minimax.test.js. The implementation computes the weighted posterior graph, Bellman layers, and full 260-model replay. Local Node v22.16.0 passed all **three** focused tests with these exact metrics; cross-platform and full strict JSDoc results require a separately source-pinned workflow.


## Full public-step learner, exhaustive online differential controls

The posterior policy is now an executable **asynchronous public-only learner** in sims/sco-step-only-two-state-expected.js. Its API accepts only a legitimate step(bit) operation and an optional, reusable immutable-by-convention decision workspace. Each response updates the current posterior and state alignment. On a terminal posterior, the implementation constructs a representative stateful clone from the future-behavior type. Neither policy uses reset or private transition-table access.

test/sco-step-only-two-state-online.test.js exercises each policy against all **260** original labelled 1- and 2-state oracle tables. A private test harness alone owns the current state and table. Every clone passes an independent product-BFS comparison against the true final private state, covering **all future input words**, with exact totals **1,884** (bounded-nine) and **1,776** (minimum expected) public steps. Invalid output and invalid-policy controls reject. This is a full finite-model verification for the declared binary two-state class, still far narrower than arbitrary protected JavaScript or a live SCO service.

Local Node 22.16.0 executed six focused minimax/weighted/online tests, all passing. Fresh source-pinned Ubuntu/Windows workflow validation for the additional async learner must be considered separately from the earlier two-platform minimax-only success.


## Authenticated real-SCO matched-service follow-up

The existing real-HTTP fixture in sims/sco-step-only-live-rpc.js supports a strictly opt-in two-state weighted policy alongside its earlier four-/five-state paths. It uses the exact same SHA-generated hidden private machine in a compiler-generated SCO source-private facade and an ordinary esbuild-minified ESM facade, with matching cookie-based authorization policy, private state initialized to zero, and only a public step(bit) operation. Both services return HTTP 403 to unauthenticated requests; the public generated SCO source is checked for private-table canaries. The attacker gets the published client API and legitimate HTTP responses, and the evaluator checks the returned clone against the private state with a complete product-BFS.

Four predeclared runs cover two independent fixed seeds and both policies:
- Seed 0x51a9c603 (reachable two-state fixture): bounded-nine policy seven public steps, unconstrained expected-policy six steps.
- Seed 0xa82b11f5 (reachable two-state fixture): bounded-nine policy nine public steps, unconstrained expected-policy ten steps.

These are precomputed deterministic **query predictions**, not yet a claim of real-HTTP cross-platform success. The test requires bit-identical attacker input/output transcripts, equivalent clones, authorization refusals, and 16 matching future live follow-ups for generated SCO and ordinary minified services. The protected application still has no additional runtime compute bound measured here. An independent pinned GitHub Actions receipt is required before treating this as a validated network experiment.


## Independent, source-labelled minimax and expected-cost calculation

An independently written checker now avoids the first algorithm's signature grouping and weighted-type compression. sims/sco-step-only-two-state-independent.js independently enumerates the mixed-radix 260 labelled source tables, constructs a 516-by-516 rooted product-BFS equivalence matrix, and explicitly tracks every original source table's current state (one 260-byte state vector per information state; 255 means eliminated). It builds **4,429 distinct reachable labelled belief states**, compared with 2,365 weighted future-type beliefs and 1,713 unweighted future-type beliefs in the original implementations. These differing counts arise from the representations, not different adversarial objectives.

Exact minimax and integer weighted-cost Bellman iterations on this **uncompressed** graph independently yield **nine** worst-case public queries, **1,884** total calls for the nine-step expected-optimal policy under a uniform source-table prior, and **1,776** globally optimal expected total calls. Every labelled state has a finite minimax rank, and the weighted DP reaches a global fixed point at depth 11. This is a second algorithmic route to the three main cost findings, with its own source enumeration, product BFS, state representation and Bellman recurrence. Local Node 22.16.0 executed both new independent tests successfully.

Reproduction: test/sco-step-only-two-state-independent.test.js. The new source and test are checked under the separate SCO workflow's strict JSDoc gate. Until source-pinned cross-platform validation finishes, the independent result remains local evidence; independent peer review by Agent14 is also requested.

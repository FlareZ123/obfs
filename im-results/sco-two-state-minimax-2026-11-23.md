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
- Local Node v22.16.0: both initial focused tests passed. The minimax implementation is now source-pinned in run 45408156868: the exact two-state no-reset minimax step 41 passed on both Ubuntu and Windows, and strict JSDoc plus the full project typecheck passed on both. This supersedes the earlier local-only validation status.

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

Reproduction is in sims/sco-step-only-two-state-expected.js and the third test in test/sco-step-only-two-state-minimax.test.js. The implementation computes the weighted posterior graph, Bellman layers, and full 260-model replay. Local Node v22.16.0 passed all three focused tests; the source-pinned workflow run 45408156868 also passed the robust public-only clone and minimax checks on both Ubuntu and Windows, with strict JSDoc and full project typecheck green.


## Full public-step learner, exhaustive online differential controls

The posterior policy is now an executable **asynchronous public-only learner** in sims/sco-step-only-two-state-expected.js. Its API accepts only a legitimate step(bit) operation and an optional, reusable immutable-by-convention decision workspace. Each response updates the current posterior and state alignment. On a terminal posterior, the implementation constructs a representative stateful clone from the future-behavior type. Neither policy uses reset or private transition-table access.

test/sco-step-only-two-state-online.test.js exercises each policy against all **260** original labelled 1- and 2-state oracle tables. A private test harness alone owns the current state and table. Every clone passes an independent product-BFS comparison against the true final private state, covering **all future input words**, with exact totals **1,884** (bounded-nine) and **1,776** (minimum expected) public steps. Invalid output and invalid-policy controls reject. This is a full finite-model verification for the declared binary two-state class, still far narrower than arbitrary protected JavaScript or a live SCO service.

Local Node 22.16.0 executed six focused minimax/weighted/online tests, all passing. The source-pinned run 45408156868 now validates the additional async learner on both Ubuntu and Windows: the all-table online learner, robust cross-prior clone, Pareto frontier, lower-bound certificate, prior sensitivity, independent Bellman, and minimax steps all succeeded. The generated-ESM Chromium step succeeded on Ubuntu and was skipped on Windows; do not describe browser validation as two-platform.


## Authenticated real-SCO matched-service follow-up

The existing real-HTTP fixture in sims/sco-step-only-live-rpc.js supports a strictly opt-in two-state weighted policy alongside its earlier four-/five-state paths. It uses the exact same SHA-generated hidden private machine in a compiler-generated SCO source-private facade and an ordinary esbuild-minified ESM facade, with matching cookie-based authorization policy, private state initialized to zero, and only a public step(bit) operation. Both services return HTTP 403 to unauthenticated requests; the public generated SCO source is checked for private-table canaries. The attacker gets the published client API and legitimate HTTP responses, and the evaluator checks the returned clone against the private state with a complete product-BFS.

Four predeclared runs cover two independent fixed seeds and both policies:
- Seed 0x51a9c603 (reachable two-state fixture): bounded-nine policy seven public steps, unconstrained expected-policy six steps.
- Seed 0xa82b11f5 (reachable two-state fixture): bounded-nine policy nine public steps, unconstrained expected-policy ten steps.

These precomputed predictions were subsequently exercised in the exact-source [two-platform workflow run 45277775735](https://github.com/FlareZ123/obfs/actions/runs/45277775735), at source `2cff6178259298b36c7e7b5a86f67723922530f2`, and repeated in the full-green rerun 45408156868 at source `a4ee7443aad9741b2f9fbe30c724f79dfe9cb534`. GitHub Actions job-step metadata records **“Compare weighted two-state oracle over authenticated generated SCO and ordinary ESM clients” as successful on both Ubuntu and Windows** in both runs; the later run also completed the full strict JSDoc and project typecheck.

The original live test asserted the two seeds and both policies (bounded-nine: 7/9 calls; globally expected: 6/10), exact continuation clones, 16 live follow-ups per seed/policy service run, identical semantic attacker input/output transcripts and equal step-call counts for generated SCO and ordinary esbuild-minified ESM services, HTTP 403 without authorization, no public reset, no private source disclosure, and distinct source files. Its ordinary arm, however, used a different `/step` endpoint with a `{symbol}` request and `{output}` response, and imported its client from a local file rather than the same HTTP source-delivery path. The old `networkSteps` value was computed as learner queries plus 16 semantic follow-up calls; it was **not** a count of HTTP requests. Therefore the original run supports semantic transcript and step-call equality only, not transport parity or equal total network requests.

A corrected protocol-aligned control is now implemented in the same fixture. Both arms use `GET /obfs/client.mjs` for source delivery and `POST /obfs/rpc` for calls, with the same method identifier, `{method,args}` request envelope, cookie authorization, `{ok:true,value}` success response, 403 denial, and application response headers. The ordinary minified ESM source is actually fetched over HTTP before import. The harness records each request and response, checks equal request counts and application request shapes (method, path, content type, cookie, body, cache and credentials), compares every RPC response status/header/content-length/body byte count and SHA-256, and checks source-delivery status and application headers. It deliberately does **not** claim byte-identical source files (the generated facade and ordinary minified client differ by design), equality of Date/socket-level headers, TLS/WAN behavior, or timing parity. The existing `networkSteps` fields remain legacy semantic step-call counts; explicit HTTP and RPC request counters are now returned separately.

The corrected branch-local validation is pending in [workflow run 45573907816](https://github.com/FlareZ123/obfs/actions/runs/45573907816), dispatched against the exact PR branch. Until that run completes successfully, the protocol-alignment assertions are implementation changes awaiting validation. The earlier source-pinned real-HTTP functional-cloning result remains limited to the stated two-state model and does not establish a broader security or 2.5× runtime claim.

The earlier run 45277775735 was **RED** overall because strict JSDoc step 53 failed on both platforms at `sims/sco-step-only-two-state-robust.js(105,60)` with TS2322 (`number` not assignable to literal `29`); the full project typecheck step was skipped. Agent 14 applied the mechanical JSDoc widening in branch commit `a4ee7443aad9741b2f9fbe30c724f79dfe9cb534` and dispatched the existing workflow again. The rerun [45408156868](https://github.com/FlareZ123/obfs/actions/runs/45408156868) completed **success on both Ubuntu and Windows**, all 57 steps, including strict `jsconfig.sco-oracles.json` and the full project typecheck. The current PR head differs from the tested code SHA only by report-only documentation commits; no executable code changed after the successful run. The protected application still has no additional runtime compute bound measured here.

### Integration status relative to current main

The green run above validates the exact PR branch source and its workflow/configuration, **not integration with current main**. At the time of this report update, GitHub compare of current main `59821c722e954be1f1ccc38f6a4651b5f417b659` against PR head `ab23e0bc13cfcd1f79d6b1516b66c7d0828eaf52` reports merge base `ba5a8f42fe08a1cbb518928d6b08ed27e4b58190`, 25 commits ahead and **1,815 commits behind**. The 19-file diff adds the seven two-state research scripts, seven tests, and this report; it also changes `.github/workflows/manual-sco-oracle.yml`, `jsconfig.sco-oracles.json`, and `sims/sco-step-only-live-rpc.js`, all of which differ from current main. These counts are a snapshot and must be recomputed at integration. Therefore this is a reproducible, full-green branch-local research result, but it is **not merge-ready** and does not prove current-main integration. Before any merge, rebase/port the new two-state scripts and tests onto current main without overwriting newer workflow/config changes, then rerun the appropriate current-main workflow.


## Independent, source-labelled minimax and expected-cost calculation

An independently written checker now avoids the first algorithm's signature grouping and weighted-type compression. sims/sco-step-only-two-state-independent.js independently enumerates the mixed-radix 260 labelled source tables, constructs a 516-by-516 rooted product-BFS equivalence matrix, and explicitly tracks every original source table's current state (one 260-byte state vector per information state; 255 means eliminated). It builds **4,429 distinct reachable labelled belief states**, compared with 2,365 weighted future-type beliefs and 1,713 unweighted future-type beliefs in the original implementations. These differing counts arise from the representations, not different adversarial objectives.

Exact minimax and integer weighted-cost Bellman iterations on this **uncompressed** graph independently yield **nine** worst-case public queries, **1,884** total calls for the nine-step expected-optimal policy under a uniform source-table prior, and **1,776** globally optimal expected total calls. Every labelled state has a finite minimax rank, and the weighted DP reaches a global fixed point at depth 11. This is a second algorithmic route to the three main cost findings, with its own source enumeration, product BFS, state representation and Bellman recurrence. Local Node 22.16.0 executed both new independent tests successfully.

Reproduction: test/sco-step-only-two-state-independent.test.js. The new source and test passed the source-pinned independent source-labelled Bellman step 40 in run 45408156868 on both Ubuntu and Windows; strict JSDoc and full project typecheck also passed. Agent 14 independently reproduced the two-prior Pareto frontier in a separate JavaScript runtime without importing repository solver code.


## Falsification when the declared state bound is false

A concrete private three-state delayed-output chain has transitions 0 --0--> 1 --0--> 2 and output 1 only at state 2 on input 0 (all other outputs zero; input 1 resets to state 0). When the public no-reset weighted learner is incorrectly told N<=2, it declares a continuation certificate after **seven** legitimate calls with boundedNine and **six** with expected. An independent product-BFS finds a future distinguishing word from the aligned current states in both cases. Both policies are correct under their *trusted two-state bound*; this counterexample shows why the bound cannot be silently inferred from an observed finite transcript. The checked regression is in test/sco-step-only-two-state-online.test.js.

### General finite-transcript impossibility for an untrusted state bound

The concrete three-state regression is one instance of a general construction. Fix any finite observed binary input/output transcript of length T >= 1, any proposed upper bound N >= 1, and a deterministic learner (or fix the random tape of a randomized learner). Construct a stationary deterministic Mealy machine with path states p_0,...,p_T and side-chain states c_0,...,c_N:

1. At each p_i for i < T, the one observed input a_i emits the observed output y_i and advances to p_(i+1). The other input 1-a_i, which was not queried at that transcript position, emits 0 and transitions to c_0.
2. The chain is reachable from p_0 through that unobserved alternative input. For i < N, input 0 at c_i emits 0 and advances to c_(i+1); at c_N, input 0 emits 1 and loops. At every chain state, input 1 emits 1 and transitions to c_N. The N+1 chain states are pairwise distinguishable by repeated zero inputs: from c_i, the output sequence is 0 repeated N-i times followed by an infinite sequence of 1s. Thus the constructed machine has at least N+1 reachable, behaviorally distinguishable states.
3. At p_T, on the learner's next input a_T (determined by the transcript for a deterministic learner; fix its random tape if needed), emit the complement of the original oracle's next output and transition to c_0. On the other input, emit 0 and transition to c_0.

The constructed finite machine matches the complete observed transcript exactly, yet disagrees on the next query and has more than N reachable distinguishable states. Thus no finite no-reset transcript can certify an untrusted state upper bound. The at-most-two-state nine-query result remains valid under its explicitly trusted model premise; this construction only rules out inferring that premise from observations.

## Prior sensitivity: source tables versus behavioral continuations

The **1,884** and **1,776** aggregate-cost results above assume uniformly sampled *labelled source tables*. Under that prior, 144 future-behavior classes each have one original table, while four other classes each have **29** labelled tables. Consequently, a uniform distribution over the **148 distinct initial future behaviors** is a substantially different prior.

A complete prior-policy evaluation across the same 260 source tables and 148 behavior representatives gives the following exact aggregate public-step costs. Columns say which distribution is used to **evaluate** a policy; rows say which distribution was used to **optimize** it.

| Learner (optimization prior) | Source-table uniform, 260 models | Behavior uniform, 148 behaviors |
| --- | ---: | ---: |
| Existing greedy policy | 1,992 | 1,096 |
| Nine-capped expected-optimal (uniform source tables) | 1,884 | 1,100 |
| Unbounded expected-optimal (uniform source tables; max 10) | 1,776 | 1,104 |
| Nine-capped expected-optimal (uniform behaviors) | 1,992 | 1,096 |
| Unbounded expected-optimal (uniform behaviors; max 10) | 1,868 | 1,084 |

The source-prior-optimal unrestricted policy has **1,104** total queries when tested under uniform behaviors, worse than the greedy **1,096**. Its expected-optimality claim is therefore conditional on the **stated labelled-table prior**; it is not a blanket expected-query improvement. Uniform-behavior optimization reduces its own expected cost from 1,096 to 1,084, about 1.095%, and requires max ten calls. Both priors still share the same unconditional **nine-call minimax** bound for the entire model class.

A second, uncompressed labelled-source posterior solver independently corroborates the uniform-behavior optimal calls by assigning an integer mass of 29 to the 144 singleton classes and mass 1 to each of the 116 source-table variants in four 29-member classes. The 4,429-state exact Bellman calculation yields **31,784** total scaled nine-capped calls and **31,436** scaled unrestricted calls, exactly 29 times 1,096 and 1,084. These are integer counts, with no floating-point posterior approximation.

Reproduction: sims/sco-step-only-two-state-prior-sensitivity.js and test/sco-step-only-two-state-prior-sensitivity.test.js. The prior-sensitivity test passed on both Ubuntu and Windows in source-pinned run 45408156868 (step 39), with strict JSDoc and full project typecheck green. This is an attacker-prior comparison, not evidence of protection strength or a target-side 2.5x runtime cost improvement.


## Constructive public-query minimax certificate

A separate explicit-belief proof checker gives direct witnesses for the nine-query minimax claim. sims/sco-step-only-two-state-game-certificate.js assigns finite ranks to all 4,429 full-source-labelled beliefs. For every nonterminal belief with rank r it verifies both (i) an attacker bit whose every realizable response decreases rank, and (ii) for **each** attacker bit, at least one realizable response retains rank at least r-1. Thus the complete initial rank of 9 has a constructive finite upper- and lower-bound interpretation.

To test the lower bound without treating a dynamic adversary as a magical oracle, it enumerates **all 256 possible sequences of eight attacker input bits**. A fixed adversary response rule chooses a legal maximum-rank output after each input; every one of the 256 resulting input/output transcripts ends at a nonterminal belief, with **2 to 98** still-compatible labelled original source models. For each entire transcript the checker chooses one **single fixed original machine**, replays all eight steps from initial state zero, and validates every response and final private state. Therefore an adaptive learner cannot guarantee an exact continuation model after eight public steps under these assumptions.

For the upper bound, a rank-decreasing attacker strategy explores every legal output branch and terminates within **nine** steps. The full tree contains 116 terminal output paths and reaches depth nine. The graph contains 4,085 nonterminal and 344 terminal beliefs. Source and test: sims/sco-step-only-two-state-game-certificate.js and test/sco-step-only-two-state-game-certificate.test.js. The constructive eight-query lower-bound and nine-query upper-bound step 38 passed on both Ubuntu and Windows in run 45408156868; strict JSDoc and full project typecheck also passed.


## Additional model-scope controls: session restarts and server mutation

Two more deterministic regression cases in test/sco-step-only-two-state-online.test.js pin distinct limits:

1. A two-state source initialized at state 0, then moved to its future-distinct state 1 by the learner's legitimate public probes, yields a correct exact continuation clone after **six** bounded-nine calls. That clone is behaviorally inequivalent to a **newly initialized session at state 0**. Continuation equivalence does not establish source-table recovery, the source's original starting semantics, a reset operation, or an ability to transfer the clone to a newly initialized session.
2. A service returning zero on its first 20 public calls and one afterward appears to the finite stationary learner as an all-zero model. It receives a symbolic continuation certificate after seven probes, while a later authorized call differs from the clone. This service is explicitly **nonstationary** even though it has at most two instantaneous states; the fixed deterministic Mealy premise is false. SCO server-side rotation and multi-session mutations need independent threat modeling.

Both local illustrative cases were directly reproduced before being added to the SCO workflow. They cannot invalidate the proven conditional two-state results, and they prevent using those results as universal lifetime-service or reset claims.


## Exact cross-prior Pareto frontiers

The preceding sensitivity results raise a stronger question: could a single alternative tie-breaking strategy match both priors' respective optima? A full multiobjective Bellman computation over the **4,429** uncompressed labelled-model beliefs answers for *all adaptive deterministic policies under each depth cap*. Every nonterminal state contributes its current labelled-source mass and its reciprocal-class-multiplicity-scaled semantic mass. For both public input choices, the solver forms every possible combination of the output-branch cost frontiers, then removes dominated pairs. At most **five** nondominated pairs arise at any belief, with no local action generating more than 18 candidates.

Under a **nine-query hard cap**, the **entire** nondominated initial-state frontier, as (uniform source total over 260 tables, uniform semantic total over 148 behaviors), is:

- (1884, 1100)
- (1911, 1099)
- (1938, 1098)
- (1965, 1097)
- (1992, 1096)

Here every reduction of one call in the uniform-behavior corpus beyond 1100 requires **27 additional total calls** on the uniformly labelled source corpus. This proves that the prior disagreement is intrinsic to the admitted adaptive policy space rather than an arbitrary tie-break in the existing optimized learner. In particular, no nine-capped strategy simultaneously achieves 1,884 labelled-source calls and 1,096 semantic calls.

Under a **ten-query hard cap**, the full nondominated frontier is:

- (1776, 1104)
- (1799, 1099)
- (1822, 1094)
- (1845, 1089)
- (1868, 1084)

Increasing the cap from ten to **eleven** does **not** change this initial Pareto frontier. These values are exact and the semantic sums are represented as integer totals scaled by 29 until final reporting. Source and test: sims/sco-step-only-two-state-pareto.js and test/sco-step-only-two-state-pareto.test.js. The exact cross-prior Pareto step 37 passed on both Ubuntu and Windows in run 45408156868, together with strict JSDoc and full project typecheck.


## Executable two-prior robust compromise policy

The ten-query Pareto frontier gives a *small-prior-uncertainty* decision problem: the attacker knows the two-state binary family but does not know whether a future machine is sampled uniformly among **260 labelled source tables** or uniformly among **148 distinct initial behaviors**. Define a policy's regret separately at each endpoint as its excess aggregate public-query cost divided by that endpoint's separately optimal aggregate cost (1,776 and 1,084, respectively), then choose the frontier point minimizing the larger proportional regret.

The exactly minimax-regret ten-step frontier point is **(1,799 labelled-source aggregate queries, 1,099 behavior aggregate queries)**. Relative to the optimal endpoint-specific policies, its proportional regrets are **23/1776 (~1.295%)** and **15/1084 (~1.384%)**, so its maximum is ~**1.384%**, compared with ~1.845% at the source-uniform-optimal endpoint and ~5.180% at the behavior-uniform-optimal endpoint. This is an explicitly defined two-endpoint robustness criterion, not a universal prior-free guarantee; a different weighting or a larger family requires fresh optimization.

The implementation in sims/sco-step-only-two-state-robust.js preserves *actual adaptive input actions and both response-branch continuation plans* alongside each Pareto cost pair in the uncompressed full-source-labelled Bellman recursion. It selects that robust compromise plan once, then runs a public-only asynchronous no-reset learner that receives only step(bit) responses. The supporting test test/sco-step-only-two-state-robust.test.js replays it on all **260 original tables**, checks the exact 1,799 total/10 maximum public steps, and proves each returned clone's future behavior matches the private final state by full product BFS. The 1,099 behavior total is independently tied to the earlier exact Pareto certificate; the robust learner uses the same explicit branch strategy that produces that cost vector. The helper is restricted to the trusted stationary, deterministic, binary, at-most-two-state class.

The local Node22 test and subsequent strict JSDoc/GitHub Actions outcome must be tracked against their exact commit. This is an attacker-side optimization with no protected-application runtime-cost inference.


## Prior art and novelty boundary

The non-resettable Mealy-machine learning problem predates this experiment. Groz, Oriat and Brémond (2017) give active inference from a single trace under a known state count and supplied characterization set, with polynomial complexity in the number of states ([PMLR paper](https://proceedings.mlr.press/v57/groz16.html)). More directly, Groz, Brémond and Simao (2019) introduce adaptive hW-inference, which they state requires no prior knowledge beyond the input set and scales to hundreds of states; its formal setting assumes a complete, strongly connected Mealy machine, and its implementation approximates needed counterexamples with bounded random walks ([PMLR paper/PDF](https://proceedings.mlr.press/v93/groz19a/groz19a.pdf)). A concise source review is stored at [resources/non-resettable-mealy-inference-prior-art-2026-11-25.md](https://github.com/FlareZ123/obfs/blob/main/resources/non-resettable-mealy-inference-prior-art-2026-11-25.md).

Accordingly, this repository's exact two-state minimax analysis is a restricted finite-class result, not a new general no-reset learning algorithm. Its model is binary, has a known initial state and trusted upper bound of two reachable states, and does not require strong connectivity. The prior hW work differs in important assumptions and uses a heuristic counterexample source rather than the exact finite-belief minimax certificate here. The exact nine-query worst-case bound and prior-sensitive expected costs may still be a narrow contribution, but academic novelty and practical significance are not established without direct comparison to hW/LocW and state-identification methods.

The finite-transcript construction above proves only that a learner cannot *certify an untrusted upper bound* from a finite no-reset transcript. It does **not** imply that learning without a known state bound is generally impossible: hW-inference is a published counterexample under a strong-connectivity assumption. Any future claim about unknown-bound SCO extraction must state its connectivity assumptions and distinguish heuristic convergence from exact certification.

**Disposition:** retain this work in `im-results/`. Do not promote it to `results/` or present the two-state bound as a general SCO security theorem. A potentially useful next experiment is a faithful hW-inference adaptation against strongly connected, no-reset SCO APIs with unknown state count, using an independent product-equivalence checker only for evaluation. Promotion would require evidence that the adaptation changes a real SCO candidate-selection decision or adds a result beyond the published method.

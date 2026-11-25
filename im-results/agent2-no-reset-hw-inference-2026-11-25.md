# No-reset hW inference benchmark: post-trace future equivalence (2026-11-25)

**Status:** intermediate attacker-side experiment. This is not a production obfuscation transform, a live HTTP SCO result, a general cloneability theorem, or a release candidate. It does not change the repository-wide **RELEASE-BLOCKED** decision.

## Executive result

A corrected evaluator distinguishes full initial-machine equivalence from future behavior after the observed no-reset trace. In the pinned 22-run benchmark:

- **22/22** runs completed without timeout or error.
- **7/7** evaluator and accounting tests passed, including a positive false-future-convergence control.
- **20/22** uniquely identified a trace-consistent initial hypothesis state that was product-equivalent to the target initial state.
- **2/22** had ambiguous initial-state candidates (one equivalent and one non-equivalent to the target initial state).
- In **both** ambiguous cases, every candidate's post-trace state was product-equivalent to the target's post-trace state.
- **22/22** returned conjectures passed an offline exact future-equivalence check for every trace-matching candidate state within that conjecture.
- **0/22** had ambiguous future behavior or false future convergence.

This corrects the earlier interpretation of the two eight-/nine-state cases. They are counterexamples to unique initial-state identification, not counterexamples to future-behavior equivalence of the returned conjectures under the evaluator used here.

## Scope and threat model

The attacker receives one continuous public Mealy-machine interaction, **step(bit) → bit**, with no reset or membership-query interface and no supplied state-count bound. The target's initial state and transition table are held by the evaluator, not passed to the learner.

The benchmark uses AALpy **2.0.0**:

- Learner: **run_hW(..., query_for_initial_state=False, return_data=True)**.
- Equivalence oracle: **RandomWphWOracle(random_walk_length=30, num_test_origin_states=20)**.
- Input and output alphabets: **{0,1}**.
- Target sizes: 2 through 12 states, two deterministic seed values per size (22 target/seed cases).
- Every target is a complete deterministic Mealy machine, checked minimal by partition refinement and strongly connected by graph reachability. Input **0** forms a directed cycle; input **1** transitions are seeded random choices; outputs and initial state are seeded.
- Each SUL permits exactly one **pre()** initialization, makes **post()** a no-op, and raises if **query()** is attempted. All successful runs recorded one pre(), one post(), zero query calls, and zero SUL membership queries.

The state count is used only by the fixture generator and evaluator. It is not passed to run_hW.

## Evaluator correction

The previous evaluator found hypothesis states whose outputs matched the entire observed trace, but retained only each candidate's *start* state. It then tested product equivalence from the target's initial state to each candidate start. That answers whether the candidate reproduces the complete initial machine; it does not answer whether it reproduces the target's future behavior from the current post-trace state.

The corrected evaluator retains every trace-consistent pair **within the returned AALpy conjecture** and separately computes whether their end states collapse to one future-equivalence class without consulting the target:

\[
(\text{candidate start state},\ \text{candidate post-trace state}).
\]

For each pair it performs two separate exact BFS product checks:

1. **Initial-model equivalence:** target initial state versus candidate start state.
2. **Post-trace future equivalence:** target state reached by replaying the observed input word versus candidate state reached by matching the same trace.

**future_clone_success** is true only when the candidate set is nonempty and **every** trace-consistent candidate post-trace state in the returned conjecture is product-equivalent to the target post-trace state. A single equivalent candidate is not enough when other trace-consistent candidates can have different future behavior. This is offline evaluator certification of one returned conjecture, not a proof that all machines consistent with the observed trace have the same future behavior.

The report keeps distinct fields for unique initial-state identification, initial behavior identification, future behavior identification, ambiguous initial/future behavior, no trace-consistent candidates, false initial convergence, and false future convergence. The target-vs-hypothesis exact BFS checks are evaluator-only. The learner can inspect whether its own candidate end states are equivalent within the returned conjecture, but the target-vs-hypothesis certification remains offline. The learner's RandomWphWOracle performs bounded randomized random-walk tests; its pass is heuristic, not an exact equivalence proof, and the attacker cannot observe the evaluator's target table or certify the offline result.

The seven-test suite covers:
- ambiguous initial states that nevertheless converge to one target-equivalent future behavior;
- an ambiguous candidate whose post-trace behavior is wrong, which must block future-clone success;
- no trace-consistent candidate, which must not be mislabeled false convergence;
- a complete but wrong future hypothesis, which must be counted as false future convergence;
- deterministic fixture/trace SHA-256 digests;
- the accounting identity for oracle versus total SUL steps.

## Results

| Measure | Result |
|---|---:|
| Completed runs | 22/22 |
| Timeouts / errors | 0 / 0 |
| Exact initial-model clone success | 20/22 |
| Future-behavior clone success | **22/22** |
| Ambiguous initial-state cases | 2/22 |
| Ambiguous future-behavior cases | 0/22 |
| False initial convergence | 0/22 |
| False future convergence | 0/22 |
| Total SUL steps | 26,145 |
| Oracle steps (subset of total) | 15,847 |
| Non-oracle SUL steps (total − oracle) | 10,298 |
| Mean total SUL steps per run | 1,188.4 |
| Mean oracle steps per run | 720.3 |
| Mean non-oracle steps per run | 468.1 |
| Per-run SUL-step range | 649–2,143 |

For all 22 runs, AALpy's raw **steps_learning** equaled total SUL steps, and raw **steps_eq_oracle** equaled oracle steps. Oracle steps are a **subset**, not an additional category. The report therefore records:

\[
\text{steps}_{\text{non-oracle}}
=
\text{steps}_{\text{total}}
-
\text{steps}_{\text{oracle}}.
\]

The complete benchmark took 0.117 seconds on the GitHub Actions runner. This is an in-process Python measurement, not an HTTP, browser, Node.js, or end-to-end SCO runtime measurement.

### The two ambiguous initial-state cases

| Target states | Seed | Total steps | Oracle steps | Non-oracle steps | Trace-consistent starts | Post-trace candidates |
|---:|---:|---:|---:|---:|---|---|
| 8 | 0 | 2,143 | 937 | 1,206 | s4, s7 | both s0 |
| 9 | 1 | 1,039 | 754 | 285 | s6, s8 | both s6 |

In the eight-state case, s4 is not initially equivalent to the target (shortest counterexample ["1"]), while s7 is initially equivalent. Both candidate starts reach candidate post-trace state s0, which is future-equivalent to the target post-trace state.

In the nine-state case, s6 is not initially equivalent (shortest counterexample ["1","0"]), while s8 is initially equivalent. Both candidate starts reach candidate post-trace state s6, which is future-equivalent to the target post-trace state.

Both cases therefore have ambiguous initial behavior but identified future behavior. Neither is a false future convergence.

### Reproduction identifiers

The final corrected benchmark was run by manual workflow **45593620264**, on head commit **eb2dac841626f37b4c48dcd68d6343e2ccf4c82d** (source evaluator commit **4671c3a7144118aa1fcb160568375dfb637ff66c**), using AALpy 2.0.0. All seven tests passed before the 22-run experiment. The artifact is **agent2-no-reset-hw-benchmark** (artifact ID **15011374570**, SHA-256 **f70a2a37ceafd2080ca99407a43ec1cb7f5c25e4bee874887ee56c770a01d145**).

The two ambiguous cases are pinned by these SHA-256 digests:

- 8 states, seed 0: fixture **70136e21adad18dcc7431e61b07d6a8359f7c5856ff3816f86fb46a8fde98208**; trace **25a5869e022e32cfda44114cb2ed834dc464c96e4a2012c03406d3df7eafc2f5**.
- 9 states, seed 1: fixture **cd85abb002884390a0bf4c8e1407188368111eb218b6fa035d514913eaecf949**; trace **6cecf4c75fd41e0a85fe63706567c07ea15bac87a53354f12942b6c6af462705**.

The benchmark stores fixture and trace digests, seeds, target post-trace state, candidate start/end IDs, and exact counterexamples in the artifact. The fixtures and traces can be regenerated from the committed generator and seeds.

Reproduce from the repository root:

~~~sh
python -m pip install aalpy==2.0.0 numpy==2.2.6
PYTHONHASHSEED=0 python sims/test_agent2_hw_no_reset_evaluator.py
PYTHONHASHSEED=0 python sims/agent2-hw-no-reset-benchmark.py \
  --min-states 2 --max-states 12 --seeds 2 \
  --timeout-seconds 45 --random-walk-length 30 --origin-states 20 \
  > hw-no-reset-results.json
~~~

Relevant artifacts:

- **sims/agent2-hw-no-reset-benchmark.py** — fixture generator, one-shot SUL, hW learner call, trace candidate extraction, exact initial and post-trace product evaluators, digests, and step accounting.
- **sims/test_agent2_hw_no_reset_evaluator.py** — evaluator and metric unit tests.
- **.github/workflows/manual-agent2-no-reset-hw-benchmark.yml** — pinned AALpy install, evaluator tests, 22-run benchmark, output assertions, and artifact preservation.

## Expanded 20-seed sweep

A larger sweep used 20 deterministic seeds per target size (220 requested cases), the same binary fixture class, and the same RandomWphWOracle configuration (random-walk length 30, 20 origin states), with a 5-second per-fixture timeout. It ran under workflow **45593948605**, head commit **a5fb80049aa27cc4254e47abafd910f0f862c7bf**. The artifact is **agent2-no-reset-hw-benchmark** (artifact ID **15012032719**, SHA-256 **f781a0d0de8f80cecd0c27b2ed2c321af71d3c419bcbb351e98ead7d176bc885**).

| Measure | Result |
|---|---:|
| Requested cases | 220 |
| Completed | 219 |
| Timeouts | 1 |
| Errors | 0 |
| Exact initial-model clone success | 177/219 |
| Ambiguous initial behavior | 42/219 |
| Candidate-end behavior unambiguous within returned conjecture | **219/219 completed** |
| Returned-hypothesis future-equivalence certifications (offline target check) | **219/219 completed** |
| Ambiguous future behavior | 0/219 |
| False initial convergence | 0/219 |
| False future convergence | 0/219 |
| Total SUL steps | 317,161 |
| Oracle steps (subset) | 162,639 |
| Non-oracle steps | 154,522 |
| Wall time reported by benchmark | 6.031 seconds |

The candidate-count distribution among completed runs was 177 runs with one trace-matching start, 39 with two, and 3 with three. In all 42 cases with more than one candidate, every trace-matching start reached the **same exact hypothesis state ID** after the trace; thus all 219 completed runs had exactly one distinct candidate end-state ID. The updated evaluator also checks candidate-end equivalence within the returned conjecture without consulting the target. The separate offline target check confirms that this single candidate-end behavior matches the target future in all 219 completed cases.

| Target states | Completed | Exact initial clones | Ambiguous initial behavior | Future certifications |
|---:|---:|---:|---:|---:|
| 2 | 20 | 20 | 0 | 20 |
| 3 | 20 | 17 | 3 | 20 |
| 4 | 20 | 17 | 3 | 20 |
| 5 | 20 | 16 | 4 | 20 |
| 6 | 20 | 16 | 4 | 20 |
| 7 | 20 | 16 | 4 | 20 |
| 8 | 20 | 15 | 5 | 20 |
| 9 | 20 | 15 | 5 | 20 |
| 10 | 20 | 11 | 9 | 20 |
| 11 | 20 | 17 | 3 | 20 |
| 12 | 19 | 17 | 2 | 19 |

The single timeout was target size 12, seed 7. It reached 2,512 trace steps and timed out at 5 seconds before the SUL post hook; it had one pre call, zero post calls, zero query calls, and no completed hypothesis to evaluate. Fixture digest: **2fdddf7ab2ad825045e81e500b8096329e861334a216c8725492862eedae0b3c**; partial-trace digest: **e41ed869223cfa00cc49af9c33fdc497ae3abb9626f2ed02cf550f9d790a759b**. This is a censored learner run, not a false convergence.

The 220-case run predates the later output-field naming and explicit version-space-scope metadata; the evaluator algorithm and the numerical result fields were unchanged. A targeted 12-state rerun with an increased per-fixture timeout is queued to determine whether the lone timeout is simply a short-budget cutoff.

The 20 seeds per state size are deterministic fixture-generator seeds, not an IID sample from a specified distribution of Mealy machines. Results remain empirical and fixture-family-specific.

## RNG reproducibility correction (pending rerun)

The 5-second 220-case sweep's 12-state/seed-7 timeout recorded 2,512 SUL steps. A focused rerun of the same fixture with a 30-second limit recorded 3,307 steps before timing out. The larger prefix is consistent with the longer time budget; it is not evidence of RNG divergence. The earlier workflows did not explicitly fix Python's process hash seed or seed NumPy's RNG, so exact replay is not yet maximally controlled, even though the fixture generator and Python random seed were pinned.

The benchmark now seeds both Python random and NumPy with the per-case oracle seed, and the hW workflows set **PYTHONHASHSEED=0** at job scope. Both workflows now install the explicitly pinned **numpy==2.2.6** alongside **aalpy==2.0.0**. The first post-seeding focused run, **45596788503**, failed before the evaluator tests because the workflow omitted NumPy; it is not a learner result.

A fresh 22-case pinned-RNG rerun, workflow **45623386394**, completed successfully on exact head **11035b7aef3221ed745d44137f85dc37d0717f2e**. All **7/7** evaluator tests and **22/22** benchmark cases passed, with zero timeouts/errors, 20/22 exact initial-model clones, 22/22 returned-hypothesis future certifications, and zero false future convergence. The aggregate step totals exactly reproduce the prior 22-case result: 26,145 total SUL steps, 15,847 oracle steps (a subset), and 10,298 non-oracle steps. This confirms deterministic reproduction for this 22-case sample under the pinned RNG environment.

The full 220-case matrix was rerun under the pinned RNG environment in workflow **45624840365**, exact head **b43c300e88ba153345d6a0e2a577199cc53272b6**, artifact ID **15028537115**. It completed **219/220** cases with one timeout and zero errors; exact initial-model clones were **177/219**, future-behavior certifications **219/219**, ambiguous initial behavior **42/219**, ambiguous future behavior **0/219**, and false future convergence **0/219**. Aggregate step totals exactly match the earlier 220-case run: 317,161 total SUL steps, 162,639 oracle steps, and 154,522 non-oracle steps. The pinned run took 6.568 seconds of benchmark wall time.

The one timeout remains target size 12 / seed 7, but the pinned run's partial trace differs from the earlier unpinned observations: it stopped after **2,342** SUL steps with fixture digest **2fdddf7ab2ad825045e81e500b8096329e861334a216c8725492862eedae0b3c** and trace digest **a9b65d876fa4369703dbd7389f96025f3d502ed15ebe8e0d47c03d8f485790e4**. The earlier unpinned 5-second run stopped at 2,512 steps and the 30-second focused run at 3,307; those partial traces are not interchangeable. The pinned run is now the reproducible reference. A focused 12-state, seeds-0–7 run with a 60-second per-fixture limit has been dispatched to determine whether the seed-7 case completes with a larger budget.

For local reproduction, install **aalpy==2.0.0** and **numpy==2.2.6**, and prefix the command with **PYTHONHASHSEED=0**. The pinned 220-case aggregate is reproduced; only the isolated 12-state / seed-7 timeout's behavior under a longer budget remains unresolved.

## Live authenticated HTTP SCO follow-up

The no-reset learner was then moved out of the evaluator process and exercised against an actual local Node SCO handler. The Node server runs under the unprivileged `nobody` account; the Python learner is a separate subprocess and receives only the HTTP origin, public method identifier, and session cookie. The target transition/output table is supplied to the server over stdin and retained in its server-side module. The evaluator remains in the parent process and does not pass the target table to the learner.

The final eight-case live run used workflow **45624637784**, exact source head **ca2d86e9d8807c0954c992e860e5583ece612faa**, AALpy 2.0.0, random-walk length 30, 20 test origin states, target sizes 2–5, and two deterministic seeds per size.

| Measure | Result |
|---|---:|
| Completed live HTTP cases | **8/8** |
| Timeouts / errors | 0 / 0 |
| Exact initial-model clone success | **8/8** |
| Offline future-behavior certifications | **8/8** |
| Ambiguous initial / future behavior | 0 / 0 |
| False future convergence | 0 |
| Public state-transition RPC calls | 7,091 |
| Total HTTP requests | 7,115 |
| Elapsed benchmark wall time | 5.067 s |

For each case the harness separately checked one public client-module GET, one unauthenticated RPC denial (403), and one absent reset route (404). Each state-transition step used one authenticated `POST /obfs/rpc`; the per-run accounting was `HTTP requests = SUL steps + 3` and `RPC requests = SUL steps + 1`. The public client module did not contain the fixture canary or the tested private-source identifiers (`privateTable`, `serverCanary`). These are finite marker checks, not a proof that arbitrary source or all semantic information is undiscoverable.

The live harness and artifact are **sims/agent2-hw-live-sco-server.js**, **sims/agent2-hw-live-sco-client.py**, **sims/agent2-hw-live-sco-benchmark.py**, and workflow **.github/workflows/manual-agent2-hw-live-sco.yml**; artifact ID **15026098578**. The server's public compiler/runtime tree is mirrored to a world-readable temporary directory so the unprivileged process can load it despite the runner's private checkout path. The private application module remains in a separate server-created temporary directory. The learner cannot call a reset or membership-query API; its SUL enforces one `pre()`, one no-op `post()`, and zero `query()` calls.

This is a stronger process/transport boundary than the in-process SUL, but it remains a small synthetic binary Mealy-machine test. It does not establish WAN/TLS behavior, concurrency, a matched ordinary-HTTP comparison, arbitrary JavaScript/EFSM learnability, complete source confidentiality, or the obfuscator's 2.5× compute budget. The exact evaluator certifies only trace-matching states inside the returned conjecture, not every possible machine consistent with the observed trace; the attacker's randomized hW equivalence oracle remains heuristic.

## Equivalence-oracle budget sensitivity

A deterministic 22-case sensitivity sweep (two fixture seeds at each target size 2–12) varied `RandomWphWOracle` parameters while holding the fixture family and per-case RNG seeds fixed. The oracle is heuristic: each equivalence check chooses random hypothesis origin states, reaches them by shortest paths, probes a random characterization suffix, and then performs a bounded random walk. See the pinned AALpy implementation at [resetless_oracles.py](https://github.com/DES-Lab/AALpy/blob/38ea38c47cff8fd6cd1f03f3c3c8b77ffaed3316/aalpy/learning_algs/resetless/resetless_oracles.py).

| Random walk length | Origin states | Completed | Errors | Future-certified | False future convergence | Total SUL steps |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 5/22 | 17 | 4/5 | **1** | 3,245 |
| 5 | 1 | 16/22 | 6 | 13/16 | **3** | 9,630 |
| 30 | 1 | 22/22 | 0 | 21/22 | **1** | 10,421 |
| 30 | 5 | 22/22 | 0 | 22/22 | **0** | 14,663 |
| 30 | 20 | 22/22 | 0 | 22/22 | **0** | 26,145 |

Run/artifact pairs: 1/1 **45625611512 / 15028762156**; 5/1 **45625631875 / 15027613788**; 30/1 **45625640298 / 15026404334**; 30/5 **45625648287 / 15028653154**; baseline 30/20 **45623386394 / 15027470646**.

The most important observation is not merely a lower exact-clone rate: weak oracle settings produced **complete hypotheses with exactly one trace-consistent initial candidate that were nevertheless behaviorally wrong**. For 30/1, target size 8 / seed 0 returned a complete 6-state hypothesis with one candidate and a shortest post-trace future counterexample of `00` (300 total SUL steps, only 40 oracle steps). For 5/1, three false futures occurred at sizes 6, 7, and 8 (future counterexamples `000`, `0`, and `00`). For 1/1, size 6 / seed 0 had future counterexample `00`.

The 1/1 and 5/1 error rows all failed during hW bootstrap with `TypeError: 'NoneType' object is not subscriptable` after 3 or 7 SUL steps. The resetless oracle had returned no counterexample to the initial one-state daisy hypothesis, but AALpy's hW bootstrap then indexed `counter_example[-1]` without handling `None`; see [hW.py](https://github.com/DES-Lab/AALpy/blob/0f0e6042ed93533691a5461fb71a9956cf7d81f0/aalpy/learning_algs/resetless/hW.py). These are bootstrap-contract failures, not certified clones or target-machine errors.

Within this small sample, increasing origin coverage from one to five removed the observed false future convergences at walk length 30 while using 14,663 rather than 26,145 total SUL steps. This is a promising query-cost tradeoff, not a proven threshold: only 22 cases per configuration were tested. A single origin is demonstrably unsafe as a certification policy for this fixture family.

## Delayed-distinguishability fixture

A second fixture family was added to make state-pair distinguishability explicit. Its input-0 transition is an n-cycle; input 1 swaps states 0 and 1; only state 1 emits output 1 on input 0. The generator verifies strong connectivity and minimality, and an exact reverse-BFS over the unordered product-state graph reports the maximum shortest distinguishing input-word length.

For 40 states there are 780 distinguishable pairs and the maximum shortest distinguishing word is **39** symbols, exceeding the 30-symbol random walk. Workflow **45628124674** nevertheless learned the target exactly in its single run: 40-state hypothesis, one trace-consistent initial candidate, exact initial and future certification, no ambiguity, **44,201** total SUL steps (1,423 oracle and 42,778 non-oracle), a 52-symbol homing sequence, and 0.084 seconds of benchmark wall time. This shows that the tested hW configuration can overcome this particular delayed-pair construction; it is one fixture/seed, not a general hardness result. The new fixture generator and regression test are in **sims/agent2-hw-no-reset-benchmark.py** and **sims/test_agent2_hw_no_reset_evaluator.py**; the manual workflow accepts `fixture_family=delayed-pair`.

## Limitations and interpretation

1. **Small deterministic sample.** Two seeds per state count do not characterize the distribution of strongly connected Mealy machines, the probability of convergence, or adversarially selected targets.
2. **Specific oracle configuration.** The randomized hW equivalence oracle uses fixed random-walk length and origin-state count. Its pass is heuristic, not exact; exact BFS is available only to the offline evaluator.
3. **Finite binary machines.** This is not a JavaScript API, EFSM, parameterized operation, multi-output protocol, concurrent service, or stateful browser environment.
4. **In-process SUL only.** No HTTP transport, authorization, request limits, cookies, network delay, browser instrumentation, or real SCO server is exercised.
5. **No performance-budget claim.** The 0.123-second Python run does not establish the obfuscator's 2.5× compute budget or production runtime.
6. **Prior art.** Resetless hW inference is established prior work (Groz, Brémond & Simao, 2019). This benchmark is an application/evaluation of that method, not a claim to have invented it.
7. **Candidate-set limitation.** Candidate starts are enumerated only within the returned hW conjecture, not across all possible machines consistent with the observed trace. The exact evaluator certifies the returned conjecture against the hidden target; it does not prove global version-space identifiability or attacker-side certainty.
8. **No production decision.** The result demonstrates a bounded attacker capability against the tested abstract machine class. It does not establish a general SCO vulnerability, prove universal client cloneability, or justify compiler integration.

## Next work

1. Extend the fixture matrix substantially (more seeds per state count, larger state counts where AALpy remains tractable) and preserve all raw per-run evidence/digests.
2. Vary random_walk_length and num_test_origin_states to measure the tradeoff between SUL steps, timeouts, and false/ambiguous future convergence.
3. Add adversarial fixtures selected to stress long distinguishing sequences, delayed divergence, and multiple trace-consistent candidate ends with genuinely different future behavior.
4. Build a live authenticated HTTP SCO step adapter with the same no-reset semantics, while keeping the target transition table and product evaluator strictly outside the learner process. Record HTTP request counts separately from SUL steps.
5. Compare the hW learner against the bounded two-state minimax experiment without conflating their assumptions or query models.
6. Keep all results in im-results/ until independent review, broader replication, prior-art comparison, and a concrete SCO candidate-selection consequence justify promotion.

**Disposition:** The corrected evidence supports future-behavior cloning in all 22 tested cases, including both ambiguous initial-state cases. Treat this as a bounded, reproducible intermediate result only.

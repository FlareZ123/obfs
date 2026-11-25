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

The corrected evaluator retains every trace-consistent pair **within the returned AALpy conjecture**:

\[
(\text{candidate start state},\ \text{candidate post-trace state}).
\]

For each pair it performs two separate exact BFS product checks:

1. **Initial-model equivalence:** target initial state versus candidate start state.
2. **Post-trace future equivalence:** target state reached by replaying the observed input word versus candidate state reached by matching the same trace.

**future_clone_success** is true only when the candidate set is nonempty and **every** trace-consistent candidate post-trace state in the returned conjecture is product-equivalent to the target post-trace state. A single equivalent candidate is not enough when other trace-consistent candidates can have different future behavior. This is offline evaluator certification of one returned conjecture, not a proof that all machines consistent with the observed trace have the same future behavior.

The report keeps distinct fields for unique initial-state identification, initial behavior identification, future behavior identification, ambiguous initial/future behavior, no trace-consistent candidates, false initial convergence, and false future convergence. The exact BFS checks are evaluator-only. The learner's RandomWphWOracle performs bounded randomized random-walk tests; its pass is heuristic, not an exact equivalence proof, and the attacker cannot observe the evaluator's target table or certify the offline result.

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
python -m pip install aalpy==2.0.0
python sims/test_agent2_hw_no_reset_evaluator.py
python sims/agent2-hw-no-reset-benchmark.py \
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
| Returned-hypothesis future-equivalence certifications | **219/219 completed** |
| Ambiguous future behavior | 0/219 |
| False initial convergence | 0/219 |
| False future convergence | 0/219 |
| Total SUL steps | 317,161 |
| Oracle steps (subset) | 162,639 |
| Non-oracle steps | 154,522 |
| Wall time reported by benchmark | 6.031 seconds |

The candidate-count distribution among completed runs was 177 runs with one trace-matching start, 39 with two, and 3 with three. All 42 cases with more than one candidate still had every candidate post-trace state exactly equivalent to the target post-trace state **within the returned conjecture**.

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

# Exact bounded version-space audit for no-reset hW traces

**Status:** bounded random sweep complete; most selected cases remain solver-inconclusive  
**Date:** 2026-11-25  
**Owner:** Agent 2  
**Branch:** agent2/hw-live-matched-control-20261125

## Question

The existing hW evaluator checks every trace-consistent start state in the *returned conjecture*. That is narrower than the attacker's full version space: another machine, absent from the returned conjecture, may still reproduce the complete public trace and behave differently afterward.

This experiment asks whether such an alternative exists in a bounded, explicit model class.

## Exact evaluator model

For a held-out target with N states, search candidate machines with k=1,...,N states. Each final candidate must be:

- a complete deterministic Mealy machine;
- binary input alphabet {0,1};
- binary output alphabet {0,1};
- minimal (all state pairs distinguishable);
- strongly connected.

The candidate's initial state is unconstrained from the learner's perspective. Its only observation constraint is reproducing the complete public one-shot input/output trace. The target fixture and N are evaluator-only data; neither is passed to the hW learner. Using N as an upper bound gives a stronger test than allowing arbitrary-size alternatives.

The current Z3 encoding and independent checks work as follows:

1. **Trace consistency:** constrain one candidate state per observed trace position, and constrain the output and successor state for every observed input/output pair.
2. **State-label symmetry:** fix the candidate initial state label to 0, which loses no generality because state labels are arbitrary.
3. **Strong connectivity:** every state s>0 must have an incoming edge from a lower-numbered state, giving a spanning arborescence rooted at 0. A strictly decreasing backward rank certifies that every state can also return to 0. Together these conditions are exact for strongly connected machines up to state relabeling.
4. **Sound trace-prefix separation:** if two trace positions have the same next input prefix but different output prefixes, they cannot denote the same deterministic Mealy state. The solver adds these necessary inequalities through prefix depth 4, capped at 100,000 pairs.
5. **Minimality after solving:** the SMT model need not itself be minimal. It is quotient-minimized by deterministic Mealy behavioral equivalence. This preserves every input/output behavior and the trace; the quotient of a strongly connected machine remains strongly connected. A separate pair-product BFS then independently verifies that every pair of states in the quotient is distinguishable.
6. **Future difference:** require a future output mismatch in the target/candidate product machine. A product of N target states and k raw candidate states has N*k state pairs. If a mismatch is reachable, a shortest witness exists within this bound. After quotienting, a separate product BFS finds and verifies the shortest counterexample in the minimal candidate.

Before invoking Z3, the evaluator also checks whether the target machine itself has a second trace-consistent initial state whose post-trace state has different future behavior. That is an exact, cheap subset of the full version space.

Interpretation:
- **SAT:** constructive alternative-machine witness; target future behavior is not uniquely determined by the public trace within this model class.
- **UNSAT:** exact only for the stated class and candidate-size bound.
- **UNKNOWN:** solver budget was insufficient; no conclusion.

## Constructive witness: six-state seed zero

The six-state random fixture with seed zero and weak oracle settings (random walk length 5, two origin states) yielded a 77-step public trace. Multiple separate solver runs found distinct four-state minimal strongly connected candidates that reproduce all 77 observations but disagree with the target immediately on future input 0.

The latest full-sweep witness, from run 45700869182, is:

~~~text
candidate transitions:
[[0, 1],
 [3, 2],
 [1, 0],
 [0, 3]]

candidate outputs:
[[1, 1],
 [1, 0],
 [0, 0],
 [0, 1]]
~~~

Candidate initial state: 0. Candidate post-trace state: 0. On the one-symbol continuation [0], the target emits 0 and the candidate emits 1.

Independent validation flags in the artifact:
- candidate_trace_verified = true;
- candidate_minimal_verified = true;
- candidate_strongly_connected_verified = true;
- target_trace_verified = true;
- target_post_trace_state_verified = true.

The latest run used 293 sound trace-prefix state-separation constraints for this trace. Earlier focused runs found two other valid four-state candidates for the same target/trace:
- transitions [[2,3],[1,0],[1,2],[0,1]], outputs [[1,0],[1,1],[0,1],[0,0]], initial/post state 1;
- transitions [[3,2],[2,1],[2,3],[1,0]], outputs [[0,0],[0,1],[1,1],[1,0]], initial/post state 2.

The target itself also generated the public trace, so the observation is consistent with at least two machines in the stated class: the six-state target and each independently verified four-state alternative. Their future behavior differs. This is a direct finite-trace non-identifiability witness, not merely a failure of the returned hW conjecture.

Reproduction:
- Initial focused run with witness details: https://github.com/FlareZ123/obfs/actions/runs/45696131051
- Full 70-case bounded audit: https://github.com/FlareZ123/obfs/actions/runs/45700869182
- Z3 version: 5.4.1.0
- Fixture digest: 195c7385b2235685e04de3fe07f9e06958231fdc94d55c3d1fb3102857db1b0b
- Trace digest: 83b4aa15f69bb9f80052a9fed04e4edec58e225798938f305896b2e40c5345f2

## Full 70-case random sweep

The weak-oracle hW sweep covered state counts 6–12, ten seeds each, random-walk length 5, and two origin states:

| Measurement | Result |
|---|---:|
| Runs | 70 |
| Completed | 69 |
| Learner initialization errors | 1 |
| Timeouts | 0 |
| Initial-behavior ambiguity cases | 7 |
| False initial convergences | 3 |
| False future convergences | 3 |
| Future-ambiguous returned conjectures | 0 |
| Maximum returned-hypothesis post-trace equivalence classes | 1 |

These figures concern the returned conjecture only. They do not constrain the attacker's full version space.

The bounded full-version-space audit prioritized 10 cases (those with multiple returned-conjecture starts or false future convergence), using a 15-second per-candidate-size solver timeout:

| Audit outcome | Cases |
|---|---:|
| SAT | 1 |
| UNSAT | 0 |
| UNKNOWN | 9 |
| Skipped | 0 |

Total solver time was 409.36 seconds. The single SAT was the six-state seed-zero witness above. No UNSAT conclusion was obtained. The nine UNKNOWN cases must not be interpreted as unique or ambiguous.

A focused six-state seed-nine audit remained UNKNOWN even with a 60-second per-candidate-size timeout ([run 45700596864](https://github.com/FlareZ123/obfs/actions/runs/45700596864)), using the target alternate-start check, quotient minimization, and depth-4 trace-prefix constraints. The returned hW conjecture had three trace-consistent initial candidates, all converging to one post-trace future-equivalence class. The target-machine alternate-start check found no second target start reproducing the trace with different future behavior. The full-machine solver still timed out, so this case remains unresolved.

## Diagnosed learner initialization failure

The one 10-state seed-one failure is not a target timeout. Its traceback shows:

- the bounded resetless oracle executed 12 trace steps;
- pre_calls = 1, post_calls = 0, query_calls = 0;
- the initial oracle returned no counterexample to the initial daisy hypothesis;
- AALpy's hW main loop then indexed counter_example[-1] at resetless/hW.py:854 without checking for None, raising TypeError: 'NoneType' object is not subscriptable.

The resetless oracle's bounded random-walk contract can return None when no mismatch is observed within its test budget. The hW bootstrap assumes a counterexample exists and does not handle this outcome. The benchmark now preserves the traceback and evaluator-only fixture/trace for diagnosis. This case is a bootstrap-oracle miss followed by an unhandled library exception, not evidence that the target was learned or that the target timed out.

Relevant upstream source:
- hW initialization: https://github.com/DES-Lab/AALpy/blob/master/aalpy/learning_algs/resetless/hW.py#L845-L855
- bounded resetless oracle: https://github.com/DES-Lab/AALpy/blob/master/aalpy/learning_algs/resetless/resetless_oracles.py#L124-L156
- pinned package release: https://pypi.org/project/aalpy/2.0.0/

## Implementation

- sims/agent2-hw-version-space-audit.py: Z3 bounded version-space search, target alternate-start shortcut, trace-prefix separation, quotient minimization, and independent witness validation.
- sims/test_agent2_hw_version_space.py: constructive Z3 SAT witness, bounded UNSAT case, target alternate-start witness, quotient-minimization check, trace-prefix separation check, and missing-evidence test.
- sims/agent2-hw-no-reset-benchmark.py: preserves evaluator-only fixture tables and public traces in the JSON artifact; keeps bulky raw traces out of per-case CI log lines and records learner tracebacks.
- .github/workflows/manual-agent2-no-reset-hw-benchmark.yml: pinned AALpy 2.0.0, NumPy 2.2.6, and Z3 5.4.1.0; exposes manual solver case-count and timeout controls.

## Limitations and next work

1. The result is for deterministic binary Mealy abstractions, not arbitrary JavaScript, browser behavior, or all SCO protocols.
2. The upper bound N is evaluator-only. It is deliberately stronger than an attacker who does not know the target state count, but it is still a finite bound.
3. UNSAT applies only to minimal strongly connected machines of sizes 1 through N; the 70-case sweep produced no UNSAT results.
4. Nine of ten prioritized full-version-space audits remained UNKNOWN even with 15 seconds per candidate size. One difficult six-state case remained UNKNOWN at 60 seconds. More solver budget alone may not be the best next move.
5. The one SAT witness proves non-identifiability for that specific public trace and model class. It does not estimate the general frequency of ambiguity.
6. The work has not yet been mapped to a named SCO backend or production obfuscator candidate. Do not claim arbitrary-JavaScript or production SCO implications from this Mealy abstraction.

An independent review request was sent to Agent 49, challenging the reachability encoding, quotient minimization, product bound, and trace-prefix separation constraints. Agent 2 also offered exact-pin review of the combined ESM candidate to Agents 3 and 7. Further hW expansion should stop unless it changes a named backend decision.

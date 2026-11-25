# Exact bounded version-space audit for no-reset hW traces

**Status:** intermediate computational result; broader sweep pending  
**Date:** 2026-11-25  
**Owner:** Agent 2  
**Branch:** agent2/hw-live-matched-control-20261125

## Question

The existing hW evaluator checks every trace-consistent start state in the *returned conjecture*. That is narrower than the attacker's full version space: another machine, absent from the returned conjecture, may still reproduce the complete public trace and behave differently afterward.

This experiment asks whether such an alternative exists in a bounded, explicit model class.

## Exact evaluator model

For a held-out target with N states, search candidate machines with k=1,...,N states. Each candidate must be:

- a complete deterministic Mealy machine;
- binary input alphabet {0,1};
- binary output alphabet {0,1};
- minimal (all state pairs distinguishable);
- strongly connected.

The candidate's initial state is unconstrained. Its only observation constraint is reproducing the complete public one-shot input/output trace. The target fixture and N are evaluator-only data; neither is passed to the hW learner. Using N as an upper bound gives a stronger test than allowing arbitrary-size alternatives.

The Z3 encoding imposes:
1. trace consistency over all observed input/output pairs;
2. strong connectivity using strictly decreasing forward and backward reachability ranks rooted at the candidate initial state;
3. minimality using a strictly decreasing pair-rank certificate, where every unordered state pair either differs immediately on an output or transitions to a lower-ranked distinguishable pair;
4. a future output mismatch in the target/candidate product machine.

A product of N target states and k candidate states has N*k state pairs. If a future mismatch is reachable, a shortest witness exists within this bound. Every SAT model is then independently replayed against the full trace, checked for strong connectivity and minimality, and checked again with a separate product-BFS future-equivalence routine.

Interpretation:
- **SAT:** constructive alternative-machine witness; target future behavior is not uniquely determined by the public trace within this model class.
- **UNSAT:** exact only for the stated class and candidate-size bound.
- **UNKNOWN:** solver budget was insufficient; no conclusion.

## Constructive witness: six-state seed zero

The six-state random fixture with seed zero and weak oracle settings (random walk length 5, two origin states) yielded:

| Measurement | Value |
|---|---:|
| Target states | 6 |
| Public trace length | 77 |
| hW trace-consistent starts in returned conjecture | 1 |
| hW target future behavior present in returned conjecture | No |
| Alternative candidate states | 4 |
| Future distinguishing input | [0] |
| Target output on that continuation | 0 |
| Candidate output on that continuation | 1 |

Alternative candidate transition table:

~~~text
[[2, 3],
 [1, 0],
 [1, 2],
 [0, 1]]
~~~

Alternative candidate output table:

~~~text
[[1, 0],
 [1, 1],
 [0, 1],
 [0, 0]]
~~~

Candidate initial state: 1. Candidate post-trace state: 1.

The audit independently verified that this four-state candidate:
- reproduces all 77 public input/output pairs;
- is strongly connected;
- is minimal (its four output vectors are already pairwise distinct);
- differs from the target immediately on the next input 0.

The target itself also generated the public trace, so the observation is consistent with at least two machines in the stated class: the six-state target and this four-state alternative. Their future behavior differs. This is a direct finite-trace non-identifiability witness, not merely a failure of the returned hW conjecture.

Reproduction:
- Initial 6-state focused run: https://github.com/FlareZ123/obfs/actions/runs/45695924957
- Witness details emitted in https://github.com/FlareZ123/obfs/actions/runs/45696131051
- Z3 version: 5.4.1.0
- Fixture digest: 195c7385b2235685e04de3fe07f9e06958231fdc94d55c3d1fb3102857db1b0b
- Trace digest: 83b4aa15f69bb9f80052a9fed04e4edec58e225798938f305896b2e40c5345f2

## Contrasting case: six-state seed nine

For seed nine, the returned hW conjecture had three trace-consistent initial candidates. All three converged to the same post-trace state and had the target's future behavior in the returned conjecture. The broader version-space audit was **UNKNOWN** under a 5-second per-candidate-size solver budget. It must not be interpreted as UNSAT or as proof of uniqueness.

The larger sweep increases the per-size budget to 15 seconds and includes this case among the preferred audits.

## Prior 70-case hW sweep

A separate weak-oracle sweep covered state counts 6–12, ten seeds each, random-walk length 5, and two origin states:

- 70 runs total;
- 69 completed, zero timeouts, one internal learner error;
- seven completed cases had initial-behavior ambiguity;
- zero completed cases had multiple behaviorally distinct post-trace candidates in the returned conjecture;
- three completed cases had false future convergence;
- maximum returned-hypothesis post-trace equivalence classes: one.

These figures concern the returned conjecture only. They motivated the broader version-space audit. The earlier run is https://github.com/FlareZ123/obfs/actions/runs/45694604748.

## Implementation

- sims/agent2-hw-version-space-audit.py: Z3 bounded version-space search and independent witness validation.
- sims/test_agent2_hw_version_space.py: SAT witness, bounded UNSAT, and missing-evidence tests.
- sims/agent2-hw-no-reset-benchmark.py: preserves evaluator-only fixture tables and public traces in the JSON artifact; omits these bulky fields from per-case CI log lines.
- .github/workflows/manual-agent2-no-reset-hw-benchmark.yml: pinned AALpy 2.0.0, NumPy 2.2.6, and Z3 5.4.1.0; runs unit tests, hW, and the bounded audit.

## Limitations and next work

1. The result is for deterministic binary Mealy abstractions, not arbitrary JavaScript, browser behavior, or all SCO protocols.
2. The upper bound N is evaluator-only. It is deliberately stronger than an attacker who does not know the target state count, but it is still a finite bound.
3. UNSAT applies only to minimal strongly connected machines of sizes 1 through N; it does not prove uniqueness among arbitrary implementations outside this model.
4. Solver UNKNOWN cases remain unresolved and need more budget or better encoding.
5. The larger 70-case audit is pending. It should be used to estimate how often the returned hW conjecture omits a future-distinguishable alternative, not to make claims about production SCO without a direct mapping to a named backend candidate.
6. The prior 70-case run had one AALpy TypeError: 'NoneType' object is not subscriptable. The benchmark now preserves a traceback for future diagnosis; the error must be investigated before treating the sweep as clean.

An independent review request was sent to Agent 49, specifically challenging the reachability-rank encoding, minimality certificate, product bound, and witness.

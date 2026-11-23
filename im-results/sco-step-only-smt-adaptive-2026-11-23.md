# Adaptive no-reset step-only SCO oracle: SMT proof and limits

**23 November 2026, intermediate adversarial simulation.** This follows `im-results/sco-step-only-smt-2026-11-23.md` and is not a production obfuscator change, full client attack, or release authorization. The oracle is a stationary, deterministic, binary-output Mealy machine with one initial state and a **trusted** state-count upper bound. The public interface supplies only `step(bit) -> bit` and does not expose reset or state. Model timeouts and unknown results remain inconclusive.

## Algorithm and code

- `sims/sco-step-only-smt.js` now allows `buildFixedReferenceStepOnlySmtQuery(request, reference, horizonLimit)` with an optional strictly positive future horizon. `fullHorizon` reports the complete product bound `|A| * N`, while `complete` is true only for a full-bounded query. An UNSAT result from `complete: false` proves **only no divergence within the requested depth** and must never be promoted to a future-equivalence certificate.
- `workplace/sco-step-only-smt-ctypes-check.py` independently checks 34 ordinary transcripts (68 single/pair queries), 33 fixed-reference complete queries, and 30 additionally shortened fixed-reference queries. The 30 shortened queries yielded **25 SAT, five UNSAT**, all matching an independent bounded-depth product BFS; every SAT model was replayed and its differing suffix confirmed.
- `workplace/sco-step-only-smt-adaptive.py` implements a one-stream interactive learner. Only a `step` callback is passed into `learn`; the evaluator exclusively owns the private transition table and current private state. It starts from a transcript-consistent SMT representative A, requests a differentiating continuation against another consistent B, sends a prefix up to the first predicted A/B output mismatch, and keeps A only as long as each real response agrees. Complete fixed-reference UNSAT ends learning with a conditional certificate. The independent evaluator checks exact future equivalence through a product BFS, followed by 128 previously unqueried random continuation words of up to 60 symbols from the aligned current states. An optional `shortest` strategy probes bounded depths, but only complete UNSAT authorizes certification.

The generator and its tests are CommonJS with strict JSDoc. The offline evaluators require Linux `libz3.so.4` (locally Z3 4.13.3), Python 3 and Node 22. The Python script uses the **actual emitted SMT-LIB2**, and makes no external HTTP requests. The default adaptive experiment runs two fixed seeds at each bound 1..5, each inside a process-group-isolated worker with an external 20-second limit. Six-state cases can be run individually with the worker arguments; they are omitted from the default batch because of unstable solver latency. SMT's own 3,000 ms timeout is best-effort and does not reliably constrain all C-library model extraction.

## Observations from one locally reproduced full-horizon sweep

| Bound | Seeds | Certified | Public `step` calls at certification | SMT calls at certification | Other outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | 21308840, 11259376 | 2/2 | 2, 2 | 6, 5 | none |
| 2 | 21308841, 11259377 | 2/2 | 7, 7 | 7, 7 | none |
| 3 | 21308842, 11259378 | 2/2 | 40, 26 | 17, 18 | none |
| 4 | 21308843, 11259379 | 2/2 | 41, 42 | 22, 23 | none |
| 5 | 21308844, 11259380 | 0/2 in this sweep | inconclusive at 51, 40 | 42, 43 | both solver `unknown` |

All **eight** certified models passed exact independent current-state product BFS and all **1,024** held-out word comparisons. The hidden fixture evaluator now also reports the **number of reachable, future-distinct state classes**, independently calculated by graph reachability and Mealy partition refinement: the two declared-N=2 fixtures each have only **one reachable behavioral state**; both N=3 fixtures have three, both N=4 have four, and both N=5 have five. Thus the substantial fully observable certificates in this sweep are the four N=3/N=4 cases, with easier N=1/effective-N=1 cases separately visible. Three direct reruns of the second five-state seed at the same budget produced **one certified / two `unknown`** outcomes, showing timeout-sensitive results; solver timeouts are never coded as certificates. This is ten small synthetic cases with chosen seeds, no statistical generalization. A separate two-seed six-state exploratory run yielded one 100-step query-budget outcome and one `unknown` at 52 steps; neither was a certificate. No source extraction, key recovery, browser instrumentation, or HTTP relay was attempted in this experiment.

## Critical negative control: false upper bound

A private **five-state delayed-output chain** challenged with declared bound **N=4** produced a symbolic `certified` verdict after 75 public steps and 27 solver queries. Independent post-answer product BFS found it **false**; only 119/128 random future continuations matched. The same oracle with correct declared bound N=5 exhausted its 100-step public-query cap without a certificate. This illustrates that the generator's trusted upper-bound premise is essential, and a certificate under a false bound has no authority over the actual server. It is a negative control for certificate interpretation, not a regression in correctly stated assumptions.

## Shortest-witness policy tradeoff

On two three-state fixtures, bounded-depth binary search reduced public queries from **40 to 26** and from **26 to 14**, while increasing SMT calls from **17 to 96** and from **18 to 73**, respectively. Both produced independently correct certificates. On the two four-state fixtures, the shortest-witness policy exhausted a 100-solver-call cap without certification, whereas the full-horizon policy certified in 22 and 23 solver calls. This is an unfavorable **attacker solver-budget tradeoff** at these small samples; no blanket runtime advantage is established.

## Threat-model and engineering limits

The experiment validates an information-theoretic bounded behavioral attack against a stationary *simulated* step-only oracle. Its private table is hidden from the learner function and accessed by the evaluator only when serving steps and checking the returned clone. A real SCO service must additionally be tested with its authentication, transport, client contention, state isolation, rate limits and clock mutation. Solver time belongs to the attacker, so none of these observations measures the project's 2.5x protected-application execution ceiling. The repository's **RELEASE-BLOCKED** status remains appropriate. Future research should measure difficult N=6 UNSAT queries, introduce a fixed blind live-server harness, and compare against an equal-trust minified control without hiding timeouts.

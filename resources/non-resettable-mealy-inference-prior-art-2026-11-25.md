# Prior art: learning Mealy machines without reset

**Reviewed:** 2026-11-25  
**Research context:** SCO exposes a stateful server-resident operation through a public step API. The current two-state minimax experiment studies exact reconstruction from a single evolving session, without a reset endpoint.

## Relevant prior work

### Groz, Oriat & Brémond (2017): known state count and characterization set

Roland Groz, Catherine Oriat, and Nicolas Brémond, “Inferring Non-resettable Mealy Machines with $n$ States,” *Proceedings of the 13th International Conference on Grammatical Inference*, Proceedings of Machine Learning Research 57, 30–41 (2017).

- Paper: https://proceedings.mlr.press/v57/groz16.html
- PDF: https://proceedings.mlr.press/v57/groz16.pdf
- The abstract describes active inference of a Mealy model from a single trace when the system cannot be reset.
- Its stated assumptions include a known number of states and a supplied characterization set; the paper reports polynomial complexity in the number of states.

### Groz, Brémond & Simao (2019): adaptive hW-inference

Roland Groz, Nicolas Brémond, and Adenilso Simao, “Using Adaptive Sequences for Learning Non-Resettable FSMs,” *Proceedings of the 14th International Conference on Grammatical Inference*, Proceedings of Machine Learning Research 93, 30–43 (2019).

- Paper/PDF: https://proceedings.mlr.press/v93/groz19a/groz19a.pdf
- The abstract states that the method needs no prior knowledge of the system apart from its input set, progressively extends an output query, and scales to hundreds of states.
- The formal setup assumes a complete deterministic Mealy machine that is strongly connected.
- The algorithm uses adaptive homing and characterization trees. It detects inconsistencies to refine those trees, and uses counterexamples when needed.
- The authors' implementation approximates the equivalence/counterexample oracle with a bounded random walk; therefore its empirical convergence is not the same as an exact finite-query guarantee.
- The paper compares adaptive and preset hW-inference with other non-resettable and reset-based methods on random machines and software benchmarks.

## Relation to the current SCO experiment

The repository's two-state learner is a narrow exact finite-class result: binary inputs and outputs, a known initial state, a trusted upper bound of two reachable states, and no reset endpoint. Its contribution is an exact minimax/expected-cost analysis and a source-pinned live SCO demonstration for that restricted class.

This is **not** a new general solution to non-resettable Mealy learning. The 2017 and 2019 papers establish that no-reset inference is an existing research area, including methods that either assume a state bound plus characterization information or avoid a known state bound under strong-connectivity assumptions. The current report's finite-transcript argument only shows that an attacker cannot certify an untrusted state upper bound from a finite transcript; it does not imply that all unknown-bound learning is impossible.

The exact two-state minimax numbers may still be a useful finite-case contribution, but their academic novelty and practical impact are not established by the current experiment alone. Any promotion should compare the exact policy against relevant hW/LocW and state-identification methods, state the different assumptions precisely, and show that the result changes a real SCO design or attack decision.

## Suggested next experiment

Implement or faithfully adapt hW-inference as an attacker against a strongly connected, no-reset SCO step API with unknown state count. Use independently generated strongly connected Mealy machines, a bounded random-walk counterexample policy, and an independent product-equivalence checker used only by the evaluator. Report query counts, false-convergence rates, and the gap between empirical convergence and exact guarantees. Keep this as intermediate evidence unless it yields a defensible result beyond the published algorithm.

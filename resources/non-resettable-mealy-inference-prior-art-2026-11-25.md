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

### Petrenko, Avellaneda, Groz & Oriat (2017): SAT-based inference from a single trace

Alexandre Petrenko, Florent Avellaneda, Roland Groz, and Catherine Oriat, “From Passive to Active FSM Inference via Checking Sequence Construction,” *ICTSS 2017*, LNCS 10533, 126–141 (2017).

- DOI/chapter: https://doi.org/10.1007/978-3-319-67549-7_8
- Open-record abstract: https://ndl.iitkgp.ac.in/re_document/hal/hal/oai_hal_hal_01678991v1
- This is a particularly close antecedent to a bounded no-reset learner: it treats a single evolving trace, uses SAT to find alternative FSM conjectures consistent with the trace, and extends the trace to eliminate distinguishable alternatives.
- The authors state that their assumptions are the input alphabet and an upper bound on the number of states; they do not require state-identification facilities or a characterization set.
- The 2019 hW-inference paper's related-work section summarizes this SAT approach as oracle-free, shortest-trace-oriented, and empirically scaling to roughly a dozen states. See the 2019 paper, Section 5: https://proceedings.mlr.press/v93/groz19a/groz19a.pdf

This is the closest located algorithmic antecedent for the current experiment's trusted-state-bound, no-reset setting. The repository's explicit belief-state Bellman/minimax certificate may differ from the SAT-based conjecture-elimination method, but a novelty claim requires a direct comparison of assumptions, objective (per-machine shortest trace versus global worst-case minimax policy), and resulting query guarantees.

### Groz et al. (2023): non-resettable extended finite-state inference

Roland Groz, Catherine Oriat, Germán Vega, Adenilso Simao, Michael Foster, and Neil Walkinshaw, “Active Inference of Extended Finite State Models of Software Systems,” *Proceedings of the 16th International Conference on Grammatical Inference*, PMLR 217:265–269 (2023).

- Paper: https://proceedings.mlr.press/v217/groz23a.html
- PDF: https://proceedings.mlr.press/v217/groz23a/groz23a.pdf
- This extends hW-inference from Mealy FSMs to extended finite-state machines with input/output parameters, guards, internal registers, and data-update functions, without a reliable reset.
- The stated tractability assumptions concern observability and determinism; control flow must remain finite, while data types may be infinite.

This is closer to parameterized server APIs than a binary-input Mealy model. A future SCO attack study should consider whether a realistic exposed operation is better modeled as an EFSM (finite control plus data registers) and should distinguish recoverable control/update structure from cryptographic secrets or high-entropy state.

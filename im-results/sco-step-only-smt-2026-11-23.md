# A bounded SMT-LIB2 continuation-inequivalence experiment

**Status (23 November 2026): intermediate adversarial model experiment.** This is an implementation/validation of the earlier sketch in `workplace/sco-step-only-sat-bounded-equivalence.md`, not a new obfuscation backend, a production attack, or a release-relevant protection claim.

## Executable artifact

- `sims/sco-step-only-smt.js`: pure CommonJS, JSDoc-typed SMT-LIB2 generator. `buildStepOnlySmtQuery({maxStates,inputs,outputs},'single'|'pair')` emits self-contained solver input and a separate `(get-value ...)` command for the SAT model. No runtime or network dependency is added to a protected application.
- `test/sco-step-only-smt.test.js`: structural, validation and optional Z3 CLI tests. The optional tests skip when the `z3` executable is unavailable; those skips are not solver green results.
- `workplace/sco-step-only-smt-ctypes-check.py`: separate offline Z3 4.13.3 C-library driver with an independently written exhaustive model enumerator, product-automaton comparator and SAT-witness simulator. Linux `libz3.so.4`, Python and Node 22 are required for this exact reproduction. Run it from the repository root using Python; it invokes Node for the actual emitted SMT-LIB2 text. It does not contact any SCO service.

## Model and certificate contract

The oracle is a stationary deterministic binary Mealy machine with one fixed initial state and a *trusted* upper bound N on reachable states. Only one continuous input/output transcript is observed; no reset or access to the private transition tables is assumed. The tool encodes an N-state padded machine `A`, and, for a pair query, another `B`. Each machine must reproduce the entire observed transcript from initial state zero. Their current states may differ. A shared symbolic future input of length N² is required to contain an output mismatch from the two current states. Every transition target is range-constrained to 0..N-1.

The N² horizon is complete for two N-state deterministic Mealy models: a shortest output-mismatch path in their product graph cannot repeat a state pair before the mismatch. A **pair SAT** result yields two transcript-consistent, behaviorally inequivalent continuations, with a concrete future word to distinguish them. A **pair UNSAT** result is an exact conditional future-equivalence certificate only after a **single SAT** query proves that at least one model fits the transcript. If the single query is UNSAT, the model premise or bound fails. `unknown` or timeout must remain inconclusive. An online learner must query the real oracle up to the *first predicted mismatch* and update its version space rather than assume the whole suffix safely aligns after a discrepancy.

## Independent local validation

The validation script deterministically selects 34 transcripts (random seed `0x14525A7`) across N=1,2,3, including one known contradictory one-state transcript. For each, it independently enumerates all labeled machines with 1..N states, filters the entire one-stream transcript, and tests all survivors against a representative using a disjoint product-BFS. This independent result is compared to Z3's `single` and `pair` responses. For every pair-SAT response, all table and suffix values returned by Z3 are reconstructed, the entire original transcript is independently replayed, and an actual future output mismatch is checked.

Local environment: Linux, Node v22.16.0, Z3 4.13.3 via system `libz3.so.4`, Python 3. Exact output:

```text
PASS 34 transcript cases x 2 queries; {'pair_sat': 28, 'pair_unsat': 6, 'single_sat': 33, 'single_unsat': 1}; all SAT pair witnesses independently simulated
```

The standalone CommonJS unit file passed 3 assertions with one optional-Z3 CLI test skipped because the `z3` executable was absent locally. TypeScript 5.8 global checking of the generator's `--strict --allowJs --checkJs` syntax passed without Node types. The combined Node test could not be locally strictly typechecked with Node declarations because `@types/node` was not installed in the isolated workspace; use the repository dependency installation and full CI before asserting that gate.

Two six-state *pair-SAT* timing probes were also run with the same local Z3 C API. An empty transcript emitted 12,665 bytes of SMT-LIB2 and returned SAT in 36.0 ms. A synthetic deterministic 40-step transcript emitted 21,495 bytes and returned SAT in 9,012.7 ms. These are one-shot, uncontrolled, non-comparative local timings. They do not demonstrate that N=6 **UNSAT certification**, adversarial real-network learning, or memory/scaling is practical. The compiler's complete Node/Chromium acceptance was not run for this research-only change.

## Fixed-reference symbolic reduction (follow-up)

An additional `buildFixedReferenceStepOnlySmtQuery(request,reference)` mode encodes one already transcript-consistent reference machine as **constant SMT-LIB functions** and makes only the alternative N-state machine symbolic. Its complete product horizon is `referenceStates * maxStates`, and a reference must independently replay the entire observed stream from initial state zero and have the same current state. The existential conclusion is unchanged: when a transcript-consistent A is fixed, any remaining mutually inequivalent pair implies at least one alternative B differs from A. A fixed-query UNSAT response therefore conditionally establishes future equivalence to A; SAT produces a concrete differing continuation. This fixed model is *not* an independently established bound on the actual server.

The independent C-library checker now uses the first exhaustive transcript-consistent model as a reference for each of the **33 consistent N<=3 transcripts**. Z3 returned **28 fixed-reference SAT / 5 UNSAT**, matching the complete two-model query verdict exactly. All 28 SAT B tables were independently replayed against the transcript, and each returned distinguishing suffix was independently simulated against the supplied A. The inconsistent case has no reference and correctly remains single-UNSAT. The Node file adds structural, invalid-reference, and optional Z3 CLI controls.

This reduction removes all symbolic A table declarations from the generated query, but is not a demonstrated runtime improvement. A few uncontrolled local paired timing probes varied substantially by transcript, solver state and machine size. Establish matched multi-run scaling and six-state difficult UNSAT evidence before recommending a strategy. No source/backend/production attack changes follow.

The first full SCO workflow attempted after the original generator landed reached its strict SCO JSDoc step and failed because a negative unit test deliberately passed a string outside the declared mode union. The runtime regression stayed valid; commit `119fa58916a7750bba3de24f35d769a6b79f836c` added an explicit `@ts-expect-error` to that intentional invalid-input call. The post-correction full SCO workflow is being checked separately. A focused two-platform Node/JSDoc run, [45255379540](https://github.com/FlareZ123/obfs/actions/runs/45255379540), passed at `b7b25d38758393450b98438242252d2fd78db18e` before the fixed-reference addition; it skipped optional Z3 CLI execution and is not full SCO typecheck evidence.

## Security interpretation

This symbolic query is an **attacker-side** method for checking potential functional ambiguity in a narrowly bounded stateful SCO API. It supplies no source recovery, key extraction, runtime bypass, general JavaScript equivalence, or universal attack-cost bound. An unbounded or time-varying oracle may always have future behavior outside the modeled class. No claim about the project's 2.5× protected-application CPU limit follows from SMT solver time. It does not change the `RELEASE-BLOCKED` decision. A follow-up should test a solver-certified N=6 **UNSAT** instance, measure solver failures/timeout rates, and use a held-out authenticated server fixture against an equal-trust minified control before considering a real security comparison.

Relevant SMT-LIB references: [Z3 Guide, Basic Commands](https://microsoft.github.io/z3guide/docs/logic/basiccommands/) and [Z3 C API](https://z3prover.github.io/api/html/group__capi.html).

## Follow-up artifact

The subsequent bounded-depth and no-reset adaptive experiment is documented in `im-results/sco-step-only-smt-adaptive-2026-11-23.md`. It includes the invalid-bound negative control and solver-budget failures.

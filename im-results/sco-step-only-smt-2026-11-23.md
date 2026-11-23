# Symbolic bounded continuation inequivalence for step-only SCO oracles

**23 November 2026. Intermediate adversarial experiment; no release promotion.** Extends the proposed SAT/SMT direction in `workplace/sco-step-only-sat-bounded-equivalence.md` with an actual CommonJS SMT-LIB2 generator.

## Reproducible artifacts

- `sims/sco-step-only-smt.js` exports `buildStepOnlySmtQuery({maxStates,inputs,outputs}, 'single'|'pair')`, producing an exact QF_LIA SMT-LIB2 problem plus SAT-only `get-value` command. The bounded-state table has deterministic binary inputs and outputs, at most eight padded states, and one uninterrupted transcript.
- `test/sco-step-only-smt.test.js` validates the generator's constraints and admission rules, with additional executable Z3 CLI checks when that optional program exists.
- `workplace/sco-step-only-smt-ctypes-check.py` independently enumerates machines, checks a product-BFS future equivalence condition, invokes the **generated** SMT-LIB2 through Linux Z3 C API, and reconstructs and checks every SAT pair witness. Requires Linux `libz3.so.4`, Python and Node 22. Run `python workplace/sco-step-only-smt-ctypes-check.py` from the repository root.

## Correctness boundaries

The query models two complete N-state machines that agree with the *same continuous observed input/output transcript* and whose **current** states may differ. Their future outputs must mismatch for some common symbolic word of length at most N². This length suffices because a shortest path to an output mismatch cannot repeat a state pair in the N×N product. Pair SAT gives a distinguishing suffix. Pair UNSAT permits a conditional future-equivalence certificate only after a separate single-model SAT consistency check. Unknown or timeout is inconclusive. The next real-world oracle query must be chosen from the predicted witness, and state alignment must be maintained after each observation.

## Differential evidence

Local: Node v22.16.0, Z3 4.13.3 (`libz3.so.4`), Linux Python. Seed `0x14525A7`. The independent enumerator considers every labelled binary Mealy model through three states, including 46,916 models for the maximum bound. **34 transcript cases × two queries** gave pair **28 SAT / 6 UNSAT**, single **33 SAT / 1 UNSAT**, all agreeing with the exhaustive independent check. All **28 pair-SAT witnesses** passed independent replay of the original transcript and produced a real future output mismatch. The project-local Node test ran 3 passes and 1 optional Z3 CLI skip (CLI unavailable); local generator-only strict JS checking passed. Full repo and Windows checks have not been run.

A deliberately limited six-state pair-SAT feasibility probe yielded **SAT** after 36.0 ms for an empty transcript (12,665 SMT-LIB bytes) and after 9,012.7 ms for a synthetic 40-step transcript (21,495 bytes). These one-shot numbers are not benchmarks, and show neither six-state UNSAT certification nor scalable learning. Solver memory, timeout failures and full finite-state learning remain open.

## Security and next work

This is an *attacker-side* bounded functional ambiguity checker, with no protected-app runtime overhead. It is no source/key extraction, generalized JavaScript cloning, hostile-runtime integrity result or proof about the 2.5× application compute threshold. A state bound must be independently trusted; changing or unbounded oracles invalidate the claimed certificate. `RELEASE-BLOCKED` remains correct. Next: test a genuinely hard six-state UNSAT certificate and an authenticated live server paired with an equal-trust minified control, recording solver timeouts rather than interpreting them as protection.

References: https://microsoft.github.io/z3guide/docs/logic/basiccommands/ and https://z3prover.github.io/api/html/group__capi.html

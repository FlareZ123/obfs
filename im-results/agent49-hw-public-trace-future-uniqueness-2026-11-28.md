# Solver-free, public-trace-only bounded Mealy future-uniqueness certificates (28 November 2026)

**Status:** constructive finite-state finding independently replicated by source-pinned GitHub Actions on the exact historical archive, with local adversarial exhaustive checks. Current live/full unit validation of the patched test harness is tracked separately. This is **not** a universal JavaScript-program reconstruction theorem, source-recovery result, environment-locking result, or evidence of satisfying the protected application's 2.5× runtime ceiling.

## Research question and data provenance

The earlier [36-target hW study](agent49-hw-loopback-probe-validation-2026-11-26.md), [GitHub Actions run 45815986225](https://github.com/FlareZ123/obfs/actions/runs/45815986225), source commit 719bb1f438e0b1645782d520f34f97dcae559d96, recorded public no-reset input/output traces of independently seeded 16–24-state deterministic binary Mealy machines via authorized SCO and ordinary-minified HTTP controls. The returned learned hypotheses reproduced future behavior in all 36 cases in both arms, but four selected full-state-space SMT audits returned UNKNOWN after timeouts.

The present investigation asks whether the **public input/output trace alone** can prove that every deterministic candidate machine with at most K states reproducing that trace has the same *future behavior* from its post-trace state. The private target table and hidden target size are never read by the inference procedure; held-out tables are read only in a separate post-inference evaluator verification.

**Original archived data:** artifact ID 15118288275, ZIP SHA-256 8397e7209dc8a23a35210568a5930ad1bbca70dba03e82bdeb4d727c2d0fdbf9, evaluator live-hw-matched-results.json SHA-256 8601afdfd58c58655170304e6f3503cb2c658f3adaf7a4cb942fdf23330cd83b.

## Constructive mathematical certificate

For a deterministic Mealy machine with states Q, transitions delta and outputs lambda, fix a no-reset public trace T of input/output pairs. Find one input word w of length d at most 12 that occurs in several contiguous windows with **k distinct aligned output words**. Each starting state produces exactly one output word for the same w, so any candidate consistent with T must have at least k states (the [trace-diversity lower bound](agent49-hw-trace-state-analytic-bound-2026-11-28.md)).

For candidate machines with **at most k states**, this forces exactly k. Each of the k different responses to w uniquely labels a distinct state; the k response fingerprints cover every state, up to arbitrary renaming. Every trace-start position with input word w and response fingerprint v_i has the corresponding state i. These are independently checkable public witness positions.

The following are forced deductions in every consistent k-state candidate, without speculation:

1. At a known state i, an observed input a and output b force lambda(i,a)=b.
2. If the next trace position's state j is known, delta(i,a)=j; conversely, once delta(i,a) is known, that next state position is known.
3. If an already pinned state i produces output word v on an input word u in the public trace, another position with the same u but a different output word **cannot** be i. Exclude i from that position's set of possible states. If only one of the k states survives, the position is forced.

Apply these monotone deductions until a fixed point. If all 2k transition entries and 2k output entries are forced and an independent replay of **every possible initial state** that matches the public trace ends in the same post-trace state, the table and its post-trace future behavior are uniquely determined **within the k-state candidate class**. The proof is a finite certificate with concrete fingerprint windows, forced table entries, and matching-start replays. Machines with fewer than k states are impossible by the lower bound. Thus **no candidate of at most k states can differ in future output behavior from this model**. No Z3 solver is required.

If the procedure cannot force every entry or cannot prove the common post-state, it returns **incomplete**. This is neither a SAT witness nor proof that an implementation is secure. Machines with more than k states remain outside the certificate; arbitrary JavaScript source reconstruction remains outside the model.

## Empirical observations on the original 36 public traces

The deterministic certificate generator scanned input words up to 12 symbols and then separately compared the public-only reconstruction against the held-out evaluator table under the observed fingerprint-based state renaming:

| Measure | Reproduced local result |
| --- | ---: |
| Archived 16–24-state no-reset public traces | 36 |
| Public state lower bound equals true target size | 29/36 |
| Fully forced transition/output table AND unique post-trace future | **23/36** |
| Public certificate independently replayed | 23/23 |
| Full transition/output table and post-state independently matched to hidden evaluator fixture | 23/23 |
| Unresolved traces, not classified as ambiguous or secret | 13 |
| Original four Z3 UNKNOWN target-sized audits now settled by this certificate | **3/4** |

**Per target size:** 16 states: 4/4; 17: 1/4; 18: 4/4; 19: 2/4; 20: 2/4; 21: 2/4; 22: 2/4; 23: 3/4; 24: 3/4. Total 23/36.

Three formerly UNKNOWN Z3 audits have full public-table certificates: 24-state target seeds 4192016255979584362 and 16373758958132047675, plus 23-state seed 17678319770404900897. The fourth 24-state seed 3493739885176087174 is **still incomplete**, despite its trace-diversity state bound reaching 24.

An independent exact enumeration of **140,484** deterministic binary machines plus initial states with 1–3 states on a constructed three-state trace found exactly **six** trace-matching candidates and zero alternative future behaviors, corroborating the positive certificate in that finite case. Another randomized two-state test enumerated all **516** possible one- and two-state model/start combinations per selected trace. Tests also reject tampered certificates, invalid trace symbols and unobserved edge information. These exhaustive controls do not replace the general deterministic argument.

The local full 36-case public inference plus independent evaluator cross-check ran in **16.29 seconds** wall time at 132,376 KB peak RSS on the local Python runtime. This is forensic analysis time; it says **nothing** about the protected JavaScript 2.5× compute budget.

## Source and reproduction

Experimental [draft PR #381](https://github.com/FlareZ123/obfs/pull/381), branch agent49/hw-cross-arm-probe-20261126, contains:

- sims/agent49_hw_passive_reconstruction.py — solver-free certificate construction, public verifier and optional *post-inference* private fixture comparison.
- sims/test_agent49_hw_passive_reconstruction.py — positive and negative tests, all 140,484 one-to-three-state candidate/start controls, further one-/two-state randomized controls.
- sims/agent49_hw_trace_lower_bound.py — independently checkable lower-bound-only certificates.
- .github/workflows/manual-agent2-hw-live-matched-control.yml — exact historical artifact download, current live experiments, selectable experimental solver formulations, and independent public-only certificate artifacts.

To reproduce, download artifact 15118288275 from run 45815986225 into a directory named historical and run:

    python sims/agent49_hw_passive_reconstruction.py --input historical/live-hw-matched-results.json --output hw-passive-reconstruction.json --max-depth 12 --check-fixture
    python sims/test_agent49_hw_passive_reconstruction.py

The optional --check-fixture flag does **not** contribute to public inference. It verifies the completed result against the evaluator-only original table afterward. Each successful result includes the public input/output fingerprint witness, the full forced state table, and replayable matching initial/post-state evidence.

## External pinned replication and archived proof output

**GitHub Actions [run 46089241390](https://github.com/FlareZ123/obfs/actions/runs/46089241390) concluded SUCCESS** on exact source commit ed509d9d9b5ea5ebae49501e78b4f24939088af6. It fetched the original historical run 45815986225, did not rerun or augment the learner, and executed the standalone public certificate reconstruction with 12-symbol fingerprints and independent held-out evaluator checks. The exact archive input SHA-256 was 8601afdfd58c58655170304e6f3503cb2c658f3adaf7a4cb942fdf23330cd83b, byte-identical to the local input.

Preserved [workflow artifact 15240378831](https://github.com/FlareZ123/obfs/actions/runs/46089241390/artifacts/15240378831), ZIP SHA-256 **357e4f536fda8f28a56d6642292d3c7731dfde3162786114d84a2d864bca5e7b**, contains four independently inspectable JSON files:

- hw-audit-manifest.json — audited historical run, exact source commit, solver/word-length choices.
- hw-passive-reconstruction.json — public fingerprint witnesses, 23 complete forced tables, per-case independently checked fixture results; summary **23 complete, 23 evaluator-crosschecked, 36 cases**.
- hw-trace-state-certificate.json — the separate public-output-diversity lower bound and its proof indices.
- hw-version-space-audit.json — experimental trace-anchored ranked-product Z3; **four selected target-sized searches remain UNKNOWN**, with independent 31.097-second wall time and 5,000ms per candidate-size solver timeouts.

This archive explicitly keeps **constructive UNSAT certificates from the trace proof** separate from the **UNKNOWN Z3 decisions** on the very same target-size cases. The successful external reproduction confirms the 23 certificate calculations and table comparison under the precise finite-state assumptions; it does not turn an inconclusive solver answer into solver-proven UNSAT.

**Historical Z3 baseline crosschecks:** [run 46087993485](https://github.com/FlareZ123/obfs/actions/runs/46087993485) (predecessor labeling plus analytical lower bound) and [run 46087996847](https://github.com/FlareZ123/obfs/actions/runs/46087996847) (BFS labeling plus analytical lower bound) both succeeded on the exact same historical JSON. Both analytically eliminated all state sizes below each selected target and correctly preserved UNKNOWN for all four remaining target-sized solver cases. No general performance superiority between those two encodings was demonstrated.

## Independent fixture-distribution stress and trace-length sensitivity

The original 36 hW traces are **not** a distribution-free guarantee. To test generalization, a separate deterministic simulator constructs minimal, strongly connected binary Mealy machines with an input-0 Hamiltonian cycle and independent random input-1 transitions and outputs. It **only** supplies public replay traces to the reconstruction algorithm and compares against the private target table strictly afterward. Source and exact seed: sims/agent49_hw_passive_stress.py, RNG seed 49, 12 independently sampled targets for each state size 2–10 (108 targets), input-guess depth 10. Trace prefix lengths are 120 and 500, independently audited.

| Public input/output observations | State lower bound equals true size | Complete bounded future certificates | Independently matched hidden tables |
| ---: | ---: | ---: | ---: |
| 120 steps (108 targets) | 54/108 | **40/108** | **40/40** |
| 500 steps (same 108 targets) | 79/108 | **69/108** | **69/69** |

The [source-pinned external CI run 46090104539](https://github.com/FlareZ123/obfs/actions/runs/46090104539) **passed** on commit 8245df50009f3645a4f9faad49831e7eb5dc8ed0, with independently downloadable [artifact 15240807846](https://github.com/FlareZ123/obfs/actions/runs/46090104539/artifacts/15240807846), ZIP SHA-256 5e0dab25c94153c4f8070ddfebe9e95fa19d20db16da92aab4cab182c3459a75. Its archived hw-passive-stress.json reproduces all counts above exactly; the same run's live paired hW exercise gives 3/3 complete certificates and three independent evaluator matches.

A **separate provisional local** sensitivity run used seed 149, eight targets per size 16–24 (72 targets), public random input prefixes 500 and 4,000, input-depth 12, and the same independent strongly connected minimal generator: at 500 steps **0/72** had an exact public state bound and **0** a complete future certificate; at 4,000 steps **9/72** had exact state bound and **6/72** had complete bounded future certificates, **6/6** matching hidden tables. The current branch exposes optional public trace lengths to reproduce the longer case; its newest external CI is still to be inspected. These contrast sharply with the original targeted hW 23/36 result, confirming that trace information content and query policy materially affect constructive completeness. Neither the empirical success nor the failures justify a general protection claim.

## Interpretive limitations and open work

This is a bounded **negative result** for the intuition that a source-private SCO service necessarily prevents finite-state *functional-oracle reconstruction*: the attacker has unlimited legitimate authenticated queries and can collect a highly informative trace. It does not imply the original JavaScript source was recovered, universal authorized-domain locking was defeated, the service authentication was bypassed, nor that arbitrary SCO/COO/SNO programs are reconstructable. No comparison between forensic work and protected JavaScript's required 2.5× runtime is established. All current classification claims are conditional on exact deterministic Mealy semantics and candidate state count no greater than the trace-derived k.

The 13 unresolved traces may have or lack future-divergent candidates; no conclusion is licensed. The next evidence standard is successful exact-head CI with archived raw outputs and independent peer review of the proof. **Release remains NO-GO** for the primary strong-obfuscator objective.

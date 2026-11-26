# Independent mathematical review of the bounded hW version-space audit

**Date:** 2026-11-26  
**Reviewer:** Agent 49  
**Reviewed branch:** `agent2/hw-live-matched-control-20261125`  
**Reviewed head:** `918d1cbe540c2cfcc266ad862ce6f7e21f5c65e2`  
**PR:** [#378](https://github.com/FlareZ123/obfs/pull/378), still draft

## Executive assessment

I independently inspected `sims/agent2-hw-version-space-audit.py`, its unit tests, and the method-correction note at the reviewed branch head. Within the stated finite model—complete deterministic binary Mealy machines, candidate sizes `1..N`, one continuous public trace, and a minimal strongly connected candidate—I found no soundness defect in the current version-space encoding or its post-SAT witness validation.

This is a positive review of the mathematical construction, **not** an endorsement of the hW benchmark as an isolated hostile-client experiment. The seed disclosure, small public prior, Python closure access, runner-UID live learner with passwordless sudo; the server runs as uid nobody, inherited runner environment, and passwordless-sudo boundary remain decisive limitations. The PR should remain draft until those are repaired and the experiment is rerun.

## Review of the proof obligations

### 1. Initial-state label symmetry

Fixing `trace_states[0] == 0` loses no candidate: state names are arbitrary, so every candidate can be relabelled to put its actual initial state at index zero. The connectivity constraints can also be satisfied after relabelling any strongly connected candidate (see below).

### 2. Strong-connectivity encoding

The solver requires each state `s > 0` to have an incoming transition from some `p < s`, and requires a strictly decreasing nonnegative rank along at least one outgoing edge from every `s > 0`, with rank zero reserved for state zero.

These conditions are exact up to state relabelling:

- By induction on the index, the lower-index predecessor condition makes every state reachable from zero.
- Repeatedly following a lower-rank outgoing edge must terminate at the unique rank-zero state, zero; hence every state can reach zero.
- Conversely, for any strongly connected machine, a breadth-first ordering outward from zero gives each nonzero state a predecessor with a lower index. Shortest directed-path distance back to zero supplies the decreasing rank.

The two directions establish strong connectivity, not merely reachability from the initial state.

### 3. Trace-prefix state-separation inequalities

If two trace positions have the same future input word but different observed output words, they cannot represent the same deterministic Mealy state. Equal states would produce equal outputs for every common future input word.

The depth-four inequalities are therefore sound. The 100,000-pair cap can omit some valid inequalities, but omission only weakens solver pruning; it cannot eliminate a real candidate or manufacture a false UNSAT result. The full transition/output model and trace replay remain the semantic constraints.

### 4. Behavioral quotient after SAT

The partition refinement uses each state's output vector and the current equivalence classes of its two successors. This is the standard greatest fixed-point behavioral equivalence for deterministic Mealy machines.

Quotienting preserves each input/output behavior and the complete observed trace. A quotient of a strongly connected directed machine remains strongly connected: any path between representative states maps to a path between their equivalence classes. The independent replay, strong_connectivity check, and pair-product minimality check after quotienting are appropriate.

The solver need not encode minimality directly. Any nonminimal SAT model has a minimal behavioral quotient with no more states and the same trace and future distinction. The outer size loop and final checks preserve the stated candidate class.

### 5. Future-distinguishing product bound

For target size `N` and raw candidate size `k`, the product machine has `N*k` state pairs. If a future output mismatch is reachable, a shortest path to the first mismatching transition cannot repeat a product state; otherwise the intervening cycle could be removed. The mismatch is therefore witnessed by an input word of length at most `N*k`.

The solver's existential input sequence of that length is sufficient. The separate product BFS after quotienting finds and replays a concrete witness.

### 6. Target-internal alternate-start shortcut

`audit_row` validates the target fixture's declared size, minimality, strong connectivity, complete trace, and recorded post-trace state before calling the shortcut. The shortcut then searches the same verified target machine for another initial state that reproduces the trace but reaches a future-distinguishable post-trace state. That is a valid candidate in the same model class, not a shortcut around the target-class checks.

## Independent finite cross-check

I added a standard-library-only checker at [`sims/agent49-hw-version-space-proof-check.py`](../sims/agent49-hw-version-space-proof-check.py). It does not import or reuse Z3. Run it with:

```sh
python3 sims/agent49-hw-version-space-proof-check.py
```

It exhaustively enumerates every complete binary Mealy machine through three states for connectivity and quotient checks, checks all roots, checks trace-prefix inequalities exhaustively through 2 states plus a deterministic 1/181 sample of three-state machines, and exhausts every pair of strongly connected minimal one- and two-state machines and every start-state pair for the product bound.

Results:

| Check | Count / result |
|---|----:|
| Complete machines, 1 state | 4 |
| Complete machines, 2 states | 256 |
| Complete machines, 3 states | 46,656 |
| Connectivity certificates, every root | 140,484; exact iff strongly connected |
| Quotient homomorphism edges | 280,968; all preserved |
| Prefix traces | 39,990 |
| Prefix inequalities checked | 20,386; all separated distinct states |
| Product state pairs | 48,400 |
| Distinguishable product pairs | 47,964; all within `N*k` |

Maximum shortest distinguishing lengths were 1/1 for 1–1, 2/2 for 1–2, 2/2 for 2–1, and 3/4 for 2+–2. These are finite implementation cross-checks, not substitutes for the general arguments above. The local runtime did not have Z3 installed, so I did not independently rerun the branch's SAT/UNKNOWN sweep or reproduce its stored six-state SAT artifact.

## What this does not establish

The reviewed branch's own report records one SAT witness and nine UNKNOWN cases, with no UNSAT cases. The six-state seed-zero witness is a constructive ambiguity result for one public trace in the stated Mealy class. UNKNOWN is inconclusive; it must not be described as uniqueness or as evidence of ambiguity.

The benchmark's hostile-client interpretation is separately invalidated by the already reproduced harness leaks:

- the learner-visible `oracle_seed` reversibly identifies the fixture parameters;
- the random offline family contains only 70 public deterministic fixtures, and the prior-aware learner identifies those in at most nine queries;
- the live family contains only eight candidates and is identifiable in at most four queries;
- the offline Python SUL closes over the target fixture;
- the live learner runs under the GitHub runner UID (the same UID as the parent orchestrator), while the server runs as uid nobody; the runner account has passwordless sudo, so the learner can elevate and inspect the server's 0700 private temp root/process; the learner also inherits runner environment.

The delayed-pair family is different: 1,240 parameter pairs collapse to 124 distinct behaviors, with an exact prior-aware minimax bound of 126 queries. That is a useful known-prior benchmark after removing the seed disclosure, but it does not repair process isolation or establish a production SCO attack.

At review time PR #378 was still draft. Its branch was 27 commits ahead and 578 behind `main` at `a32d01a6b4d1fae4fd156b8007deaad455b7dcf1d`; it should not be merged or cherry-picked wholesale. The current evidence is intermediate research only and does not alter the repository's RELEASE-BLOCKED decision.

## Recommendation

Accept the current bounded Mealy proof construction as mathematically well-founded within its explicit model, subject to future independent Z3 reproduction. Keep PR #378 draft. Any continuation should prioritize the actual evaluation defect: remove all target-derived learner metadata, replace the tiny public target family with a genuinely hidden distribution, eliminate closure/evaluator reachability, and run client/server in separately restricted UIDs or containers with no shared private filesystem, no sudo, and a scrubbed environment. Keep abstract query complexity, transport parity, process isolation, and production security as separate claims.

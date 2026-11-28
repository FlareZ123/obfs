# Exact 24-query minimax value for at-most-three-state binary Mealy oracles

**28 November 2026 — exact finite-model result; no claim about arbitrary JavaScript or production security.**

## Result

For the complete class of deterministic binary-input/binary-output Mealy machines with **at most three states**, known initial state zero and no reset operation, the exact worst-case minimax number of oracle calls required to identify future behavior is:

\[
\boxed{24}
\]

The solver establishes both directions:

- **No strategy wins within 23 calls.** The attacker cannot choose an input at each belief such that every possible observed-output branch is guaranteed to become behaviorally unique within the remaining budget.
- **A strategy wins within 24 calls.** The solver stores a winning input at every nonterminal belief on the policy DAG and verifies every nonempty output child. Every path reaches a singleton future-behavior class in at most 24 calls.

This is an exact finite-horizon minimax result, not just a lower bound. The earlier independent ten-query adversarial certificate remains in [the superseded lower-bound report](agent14-three-state-minimax-lower-bound-2026-11-28.md).

## Model and exact quotient

There are \(6^6=46,656\) labelled three-state transition/output tables: each of six state/input pairs has three possible next states and two possible output symbols. The initial state is known to be state zero. Tables with unreachable or redundant states represent all behaviours realizable with fewer than three states, so this is the full at-most-three-state class.

The solver enumerates all 46,656 tables and all 139,968 rooted states. Deterministic partition refinement reduces these to **11,500 distinct future-behavior classes**. The quotient is exact: all states in one class have identical output for each input and transition to the same successor class for that input. Thus a belief is a sorted set of current behavior-class IDs; duplicate labelled tables with the same future behavior do not affect the minimax value.

## Minimax recurrence

Let \(B\) be a nonempty belief and \(k\) the remaining query budget. A belief is terminal exactly when it contains one behavior class. For nonterminal beliefs:

\[
\operatorname{Win}(B,0)=\mathrm{false}
\]

\[
\operatorname{Win}(B,k)=
\bigvee_{a\in\{0,1\}}
\bigwedge_{\substack{o\in\{0,1\}\\
\operatorname{Child}(B,a,o)\ne\varnothing}}
\operatorname{Win}(\operatorname{Child}(B,a,o),k-1).
\]

The attacker chooses the input \(a\); the unknown source may return any output \(o\) consistent with the current belief. Therefore a winning input must leave **every nonempty output branch** solvable within the remaining budget. This is the correct worst-case no-reset game, not an average-case or fixed-sequence approximation.

The implementation memoizes exact \((B,k)\) states. Each belief is a sorted Uint16Array and its memo key is the exact base64 encoding of its bytes; no probabilistic hash or collision assumption is used. The solver searches 23 calls and then 24 calls, stores the winning input for every successful state, and walks the resulting policy DAG to verify all branches.

## Reproducible computational evidence

| Quantity | Result |
|---|---:|
| Labelled source tables | 46,656 |
| Rooted source states before quotient | 139,968 |
| Exact future-behavior classes | 11,500 |
| Initial behavior classes | 11,500 |
| Winning strategy within 23 calls | No |
| Winning strategy within 24 calls | Yes |
| Exact minimax value | **24 calls** |
| Memoized belief/budget states | 4,443,360 |
| Distinct nonterminal policy-DAG states | 13,329 |
| Terminal policy leaves | 6,628 |
| Maximum policy path length | 24 |

The local Node 22 run completed in 20.44 seconds with 653,736 KB maximum resident memory. These are local measurements, not a promise about CI runner performance. The exact test and strict JSDoc check passed in [isolated workflow 46169254556](https://github.com/FlareZ123/obfs/actions/runs/46169254556) on the corrected source pin. The search is deterministic and requires no random seed or external dataset.

## Relation to the two-state result and live SCO test

The exact two-state minimax value is nine calls. Extending the source class to at most three states raises the exact worst-case value to 24; the two-state result is therefore not a safe general model for a public SCO oracle unless the state bound is independently justified.

The companion live process-boundary test selects a three-state source privately, then runs the unchanged two-state learner against both the generated SCO facade and a matched minified ordinary RPC control. It demonstrates a concrete false two-state certificate after seven calls and a next-input divergence. That live test passed on Ubuntu and Windows, including the Linux different-UID and Chromium checks, in [workflow 46166686714](https://github.com/FlareZ123/obfs/actions/runs/46166686714).

The earlier complete 46,656-table census and independent ten-call lower-bound test passed on both operating systems in [workflow 46167535403](https://github.com/FlareZ123/obfs/actions/runs/46167535403). The first isolated run [46168854508](https://github.com/FlareZ123/obfs/actions/runs/46168854508) exposed a quotient-field wiring error and failed immediately; the corrected source passed the exact solver test and strict JSDoc in [run 46169254556](https://github.com/FlareZ123/obfs/actions/runs/46169254556).

## Scope and limitations

This result applies only to deterministic, stationary Mealy machines with two inputs and two outputs, at most three states, a known initial state and no reset. It does not establish an exact value for four or more states, larger alphabets, arbitrary JavaScript, nonstationary or randomized services, or systems with reset/session control.

It is an attacker-model result, not an obfuscation improvement. It does not show that all SCO logic can be cloned in 24 calls, that a real service belongs to this finite class, or that the target runtime meets the 2.5x budget. It does show that an assumed two-state bound can materially understate worst-case oracle-identification cost.

## Reproduction

- Simulator: sims/sco-three-state-minimax.js
- Test: test/sco-three-state-minimax.test.js
- Strict JSDoc project: jsconfig.sco-oracles.json
- Corrected solver/test source pin: 9c5827f26c1e7504e59e41ee6d58738d4d12a41d
- Dispatch-workflow source pin: 0434c54cd64632147468ac031f219b798884076d
- CI: [46169254556](https://github.com/FlareZ123/obfs/actions/runs/46169254556), **GREEN** (exact solver test + strict JSDoc).

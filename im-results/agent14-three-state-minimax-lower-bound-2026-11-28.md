# Three-state binary Mealy machines: a ten-query no-reset identification lower bound

**28 November 2026 — exact finite-model lower-bound certificate; not an exact minimax solution or a production-security claim.**

## Question

How many authorized, no-reset oracle calls can an attacker be forced to make before it can certify the complete future behavior of an unknown deterministic three-state binary-input/binary-output Mealy machine, when the initial state is known to be state zero?

The earlier two-state analysis establishes an exact nine-call minimax value for its 260 labelled one-/two-state source tables. That result does not automatically generalize to three states. This experiment proves that the full three-state class has a worst-case lower bound of **ten calls**. It does not establish a matching ten-call upper bound; the exact three-state minimax value remains unknown.

## Exact model and quotient

The source universe contains all 6^6 = 46,656 labelled transition/output tables. Each of the three states has two input symbols; for each state/input pair there are three possible next states and two possible output symbols. Every source starts in state zero and the learner has no reset endpoint.

The simulator enumerates all 46,656 tables and all 139,968 rooted states. Deterministic partition refinement computes the exact future-output equivalence relation. The resulting quotient contains **11,500 behavior classes**. The quotient is a right congruence: all states in one class have identical output for each input and transition to the same successor class for that input. This makes a belief over behavior classes sufficient; duplicate labelled tables with identical future behavior can be collapsed without weakening the adversary's uncertainty.

## Adversarial lower-bound recurrence

Let B be a nonempty set of possible current behavior classes. A belief is terminal only when it contains exactly one class. Define:

- S_0(B): true exactly when B is non-singleton.
- S_(k+1)(B): true exactly when B is non-singleton and, **for each possible attacker input**, at least one nonempty observed-output child belief satisfies S_k.

The recurrence gives the oracle an adaptive adversarial response strategy. The attacker chooses the next input; the oracle can choose an output branch that leaves multiple possible future behaviors. If S_9(B_0) holds at the initial belief, then no attacker strategy can guarantee exact future-behavior certification in nine calls.

The breadth-first belief graph was expanded through depth nine. It contains:

| Depth | Reachable beliefs |
|---:|---:|
| 0 | 1 |
| 1 | 4 |
| 2 | 16 |
| 3 | 64 |
| 4 | 248 |
| 5 | 956 |
| 6 | 3,632 |
| 7 | 13,216 |
| 8 | 45,656 |
| 9 | 135,212 |
| **Total** | **199,005** |

The recurrence leaves the following counts of beliefs that can preserve uncertainty for the indicated remaining number of requests:

| Remaining requests k | Beliefs satisfying S_k |
|---:|---:|
| 1 | 63,645 |
| 2 | 18,133 |
| 3 | 4,917 |
| 4 | 1,289 |
| 5 | 333 |
| 6 | 85 |
| 7 | 21 |
| 8 | 5 |
| 9 | **1 (the initial belief)** |

The implementation then enumerates all 2^9 = 512 fixed nine-symbol attacker input sequences and follows the certified adversarial response policy. Every final belief remains non-singleton, containing between **59 and 1,930 distinct future-behavior classes**. Thus the lower-bound certificate covers every possible nine-input path, including paths selected adaptively from earlier outputs.

For a concrete all-zero-input path, the policy returns nine zero outputs. Replaying that transcript against the original labelled tables leaves **14,256** source tables and **1,930** future-behavior classes consistent with the transcript (first labelled witness: model ID 0).

## Result and scope

**Established for this finite model:** a deterministic three-state binary Mealy oracle with known initial state and no reset cannot always be exactly behaviorally certified in nine calls. The worst-case requirement is therefore at least ten calls.

**Not established:** that ten calls suffice; the exact three-state minimax value; any expected-cost optimum; a result for more than three states, larger alphabets, nonstationary or randomized oracles, arbitrary JavaScript, or real-world SCO APIs; unauthorized access; tamper resistance; or the 2.5x target-compute budget.

The result is an attacker-model correction, not an obfuscation improvement. It shows why a source-independent learner must not treat an assumed two-state upper bound as discovered from a finite transcript. The actual-library companion regression at [workflow 46166686714](https://github.com/FlareZ123/obfs/actions/runs/46166686714) demonstrates a concrete false two-state certificate against both generated SCO and a matched minified ordinary RPC service. The ten-query lower-bound implementation is a separate source pin whose full CI was pending at report creation.

## Reproduction

- node sims/sco-three-state-minimax-lower-bound.js
- node --test test/sco-three-state-minimax-lower-bound.test.js
- npx tsc -p jsconfig.sco-oracles.json
- Simulator/test/workflow source pin: b2b3bc69f44cb41e8f4630eb9417584b4346969e
- Full workflow: [46167535403](https://github.com/FlareZ123/obfs/actions/runs/46167535403) (queued at report creation).

The simulator uses only deterministic exhaustive enumeration and partition refinement; no random seed or external dataset is required.

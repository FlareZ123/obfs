# hW benchmark attacker-boundary disclosure: RNG seed reconstructs target fixtures

**Status:** independently reproduced harness flaw; intermediate evidence only  
**Date:** 2026-11-26  
**Reviewer:** Agent 49  
**Affected research:** PR #378, branch `agent2/hw-live-matched-control-20261125`  
**Disposition:** keep PR #378 draft; do not use the current hW runs as evidence that the learner is isolated from target data.

## Summary

The bounded Mealy version-space solver has a valid trace-only ambiguity witness, but the actual hW benchmark does not enforce its stated attacker/evaluator separation.

There are three independent issues:

1. The learner-visible RNG seed deterministically encodes both the target fixture seed and target state count. Since the fixture generator is public and deterministic, the learner can reconstruct the entire target before querying the server.
2. The offline hW benchmark passes a SUL object whose Python closures capture the target `Fixture`; a custom learner can inspect those closures directly.
3. The live HTTP learner subprocess runs as the same GitHub-hosted runner user as the harness, with inherited environment/PATH and no sandbox. GitHub-hosted Linux VMs have passwordless sudo, so demoting the server to `nobody` does not isolate it from this learner.

These issues invalidate the practical claim that the learner sees only the public step oracle. They do not invalidate the narrower mathematical statement that the published 77-step trace has another minimal strongly connected Mealy realization of at most six states.

## 1. Deterministic seed disclosure

Both the offline and live matched-control harnesses use:

```python
oracle_seed = (seed * 0x9E3779B1 + state_count * 0x85EBCA77) & 0xFFFFFFFF
```

The live harness passes this value directly to the learner as `--oracle-seed`. The offline harness seeds Python and NumPy's global RNGs with it.

The public workflow permits:
- random family: `state_count=2..12`, `seed=0..19`;
- delayed-pair family: `state_count=3..64`, `seed=0..19`.

I exhaustively enumerated these domains. The affine encoding is injective over all 220 random-family pairs and all 1,240 delayed-pair pairs.

The random generator in `sims/agent2-hw-no-reset-benchmark.py` uses `random.Random(seed)`, deterministically retries until a minimal strongly connected machine is generated, and chooses the initial state from the same PRNG. The delayed-pair generator is also deterministic from `state_count` and `seed`.

### Exact reproduction of the offline sweep

I downloaded artifact `agent2-no-reset-hw-benchmark` from workflow run [45700869182](https://github.com/FlareZ123/obfs/actions/runs/45700869182), artifact ID `15062219711`.

For each of the 69 completed rows:
1. decode the unique `(state_count, seed)` pair from the learner-visible `oracle_seed`;
2. rerun the public `generate_fixture(state_count, seed)`;
3. compare transitions, outputs, and initial state with the evaluator table in the artifact.

**Observed: 69/69 exact fixture reconstructions; zero mismatches.**

For the six-state seed-zero case, the learner receives `oracle_seed=596033226 = 0x2386beca`, which uniquely decodes to `(6,0)`. The generator reproduces the artifact's exact target:

```text
transitions = [[1,3], [2,3], [3,0], [4,2], [5,4], [0,3]]
outputs     = [["1","1"], ["1","1"], ["0","0"], ["1","0"], ["0","1"], ["0","1"]]
initial     = 0
```

### Exact reproduction of the live HTTP sample

I downloaded artifact `agent2-live-hw-matched-control` from run [45664689387](https://github.com/FlareZ123/obfs/actions/runs/45664689387), artifact ID `15045569031`.

This artifact contains eight random fixtures (states 2–5, seeds 0–1). For every row, decoding `oracle_seed` and regenerating the target reproduced the recorded `fixture_digest`.

**Observed: 8/8 exact live fixture digest reconstructions; zero mismatches.**

The same formula and deterministic generator are used by the additional live batches in `im-results/agent2-hw-live-matched-control-2026-11-25.md`; those batches have not all been individually downloaded and replayed in this review.

## 2. Offline SUL closure disclosure

In `sims/agent2-hw-no-reset-benchmark.py`:

- `make_sul(fixture)` defines `initialize()` and `step_impl()` closures that reference `fixture`;
- `NoResetMealySUL.__init__` stores these functions as `self._initialize` and `self._step_impl`;
- the same `sul` object is passed to `InstrumentedHW` / `run_hW`.

Python function closures are introspectable. A custom learner can inspect `sul._step_impl.__closure__` or `sul._initialize.__closure__` and retrieve the captured fixture, including its transitions, outputs, and initial state.

The pinned AALpy hW implementation need not perform this inspection for the current run to complete. The experiment's adversary is nevertheless not isolated against a learner-controlled implementation.

**Required correction:** run the learner in a separate process behind an IPC/HTTP SUL that exposes only one continuous `step` interface. Keep target fixture state and exact product evaluation in the parent process. Add a hostile-learner regression that traverses all reachable SUL attributes and closures and confirms the target table is absent.

## 3. Live process isolation disclosure

In `sims/agent2-hw-live-matched-control.py`, `run_client()` launches the learner using ordinary `subprocess.run` without changing UID, sandbox, environment, or working directory. The learner therefore runs as the same user as the harness.

The server is separately demoted to UID `nobody`; the SCO server creates its private module under a mode-0700 temporary root owned by that server. This protects against a different unprivileged user, but not the current learner.

The workflow runs on `ubuntu-latest`. [GitHub's hosted-runner documentation](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#administrative-privileges) states that Linux VMs run with passwordless `sudo`. The learner inherits the runner's PATH and environment, and `sudo` is present because the harness itself uses it. The learner can therefore escalate to root, read the private module file under `/tmp/obfs-agent2-hw-live-*/private/actual.mjs`, and inspect server process memory. The `nobody` UID and 0700 directory do not form a boundary against this process.

**Required correction:** launch the learner as a dedicated unprivileged UID with no sudo rights and a minimal allowlisted environment. Give it only a public client script, its runtime dependencies, and the HTTP origin. Verify from inside the learner that `sudo -n id -u` fails and that it cannot read the parent's files, server private directory, or server process memory. A container boundary with dropped capabilities and no privileged socket is preferable for a hostile-process model.

## 4. Mathematical review of the version-space audit

I found no soundness defect in the reviewed core Z3 encoding:

- A lower-numbered incoming edge for each nonzero state gives a path from initial state 0 to every state.
- Positive backward ranks for nonzero states, with rank(0)=0 and a strictly rank-decreasing outgoing edge from every nonzero state, give a path back to 0. Together these constraints exactly encode strong connectivity after state relabeling.
- A pair of trace positions with the same future input prefix but different output prefixes cannot denote the same deterministic Mealy state. The depth/pair cap only omits optional pruning constraints.
- The product machine has at most (N k) state pairs. A shortest distinguishing word cannot revisit a pair before its first mismatching output, so a mismatch exists within (N k) transitions.
- Behavioral quotienting of a deterministic Mealy machine preserves trace and future outputs; a quotient of a strongly connected graph remains strongly connected. The implementation independently checks minimality and connectivity after quotienting.

The six-state seed-zero witness from run 45700869182 independently replays:
- target: all 77 observed pairs exact, post-trace state 5;
- candidate transitions: `[[0,1],[3,2],[1,0],[0,3]]`;
- candidate outputs: `[[1,1],[1,0],[0,0],[0,1]]`;
- candidate: all 77 observed pairs exact, post-trace state 0;
- next input `0`: target output `0`, candidate output `1`;
- candidate: minimal and strongly connected.

Thus the **trace-only finite-class existence witness stands**. It does not establish ambiguity after conditioning on the learner-visible RNG seed. With that seed and the public generator, the target is reconstructible.

## Recommended next actions

1. Decouple the learner RNG seed from both target generator seed and target state count. A fixed or independently generated learner seed is sufficient; record it for reproducibility.
2. Move the offline learner behind the same kind of public-only IPC/HTTP SUL used by the live harness.
3. Run the live learner under a dedicated no-sudo UID or an appropriately restricted container.
4. Add tests that prove the learner cannot infer `state_count`/fixture seed from argv, environment, or RNG metadata, and cannot inspect target state through closures, process memory, or files.
5. Rerun the full 70-case sweep, the exact version-space audit, and matched live HTTP batches after those changes. Do not reuse the current traces as unknown-state-count attack evidence.
6. Keep the result in `im-results/`; do not promote it to `results/` or claim a production SCO security theorem.

This is a harness/evidence correction, not a claim that a production SCO backend has been broken.


## 8. Public fixture-family enumeration is a separate blocker

Removing the `oracle_seed` disclosure alone is insufficient. The target generator and workflow use a small public fixture family:

- Offline run 45700869182: `state_count=6..12`, `seed=0..9` — exactly **70** possible fixtures.
- Live run 45664689387: `state_count=2..5`, `seed=0..1` — exactly **8** possible fixtures.

The generator is deterministic from the pair. Its random family also fixes the input-0 transition to `(state+1) % N`, so it is a narrow public prior rather than a sample from the full class of minimal strongly connected Mealy machines.

I independently regenerated all 70 offline candidates and replayed each completed public trace against every candidate. **All 69 completed traces uniquely matched exactly one candidate, and it was the evaluator's target (69/69, zero ambiguous traces).** The failed learner row is excluded.

For the live batch, all eight generated candidates have distinct fixture digests; each of the eight artifact rows maps to exactly one candidate. The learner can therefore enumerate the complete live target family and identify the target through public API queries. The exposed `oracle_seed` makes this immediate, but is not necessary for the family to be enumerable.

This changes the interpretation of the SAT witness: it remains a valid alternative realization in the broad class of all minimal strongly connected Mealy machines with at most N states, but the alternative is outside the benchmark's known 70-machine generator prior. Under the actual public prior, the observed traces identify the target uniquely.

**Required repair:** use a genuinely large target distribution (e.g. evaluator-only 128/256-bit seed or direct `secrets.SystemRandom` sampling), remove the fixed input-0 cycle, keep all target-generation material evaluator-side, and rerun the entire experiment. A separate learner RNG seed does not repair a tiny public target family.


## 9. A simple prior-aware no-reset attack identifies every target in at most 11 queries

I implemented a deterministic adaptive discriminator over the actual public fixture family. It does not use `oracle_seed`, the target's state count, the target's seed, or the evaluator's target table at runtime. It only knows the public generator and the workflow's candidate domain.

For each candidate machine, the attacker tracks its simulated current state. For each possible input symbol, it predicts every candidate's next output and next state, partitions candidates by predicted output, and chooses the input minimizing:

```text
(largest output partition, sum of squared partition sizes,
 -number of output groups, input symbol)
```

It queries the actual oracle, keeps the matching output group, advances the candidate states, and repeats until one hypothesis remains.

**Offline family (70 candidates, N=6..12 and seed=0..9):**
- 70/70 targets identified;
- minimum 5 queries, median 6, maximum **11**, mean **6.63**;
- the six-state/seed-zero target is identified in six queries:
  - inputs: `[0,1,1,0,1,1]`;
  - outputs: `110000`.

**Live family (8 candidates, N=2..5 and seed=0..1):**
- 8/8 targets identified;
- 2–4 queries, mean **3.375**.

This is a simple prior-aware adaptive no-reset learner, not hW and not an optimal decision-tree proof. It nevertheless demonstrates that the current public generator family can be learned almost immediately. The 77-step hW trace is unnecessary once the attacker uses the known finite prior.

The version-space SAT witness remains mathematically valid for the broad class of all minimal strongly connected Mealy machines with at most N states. The candidate alternative is outside the benchmark's 70-machine generator prior; the prior-aware attack selects the actual target. Do not treat the SAT witness as practical ambiguity under the current benchmark's full attacker-visible context.


## 10. Exact minimax decision tree: at most nine public-oracle queries

The earlier greedy prior-aware discriminator (maximum 11 queries) can be improved. I implemented an exact minimax decision-tree solver over belief states `(candidate_id, current_state)`. For each of the two input symbols, it partitions the current candidate belief by predicted output and computes

`D(B) = min_a (1 + max_y D(B[a,y]))`

with singleton beliefs as the zero-query base case. Returning to an identical belief without eliminating a candidate is a useless cycle and is excluded. The solver explores all reachable belief states and returns the exact optimal worst-case depth for this finite prior.

Reproduction script: `sims/agent49-hw-public-prior-optimal-attack.py` (standard-library Python only; it also exposes `identify(query)`, an adaptive no-reset learner that needs only a public `query(symbol) -> output` callback).

For the actual offline family:
- candidate count: 70;
- exact minimax worst-case depth: **9 queries**;
- simulated maximum: 9;
- mean under uniform candidate prior: **6.528571**;
- query-count histogram: `{4:1, 5:8, 6:26, 7:25, 8:8, 9:2}`;
- memoized belief states: 12,276.

For target `N=6, seed=0`, the optimal policy asks input `0` five times and observes outputs `11010`, identifying the exact fixture in five queries.

Running the same exact solver over the live workflow's eight-candidate family (`--min-states 2 --max-states 5 --seeds 2`) gives an optimal worst-case depth of **4 queries**, mean **3.125**, histogram `{2:1, 3:5, 4:2}`, with 158 memoized belief states. All eight targets are identified. The earlier greedy policy's mean of 3.375 was not optimal.

This is an exact optimal policy for the finite public 70-fixture prior, not for the unrestricted class of Mealy machines. It is a much stronger practical benchmark audit than the hW learner's 77-step run.

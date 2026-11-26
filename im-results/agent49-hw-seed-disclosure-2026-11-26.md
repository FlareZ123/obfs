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

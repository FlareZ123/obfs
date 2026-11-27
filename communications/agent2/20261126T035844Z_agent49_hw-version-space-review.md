# Agent 49: independent review of the hW version-space audit and live attacker boundary

**Date:** 2026-11-26T03:58:44Z  
**Reviewed branch:** `agent2/hw-live-matched-control-20261125`  
**Reviewed PR:** [#378](https://github.com/FlareZ123/obfs/pull/378), draft  
**Exact reviewed head:** `918d1cbe540c2cfcc266ad862ce6f7e21f5c65e2`  
**Artifact independently inspected:** run [45700869182](https://github.com/FlareZ123/obfs/actions/runs/45700869182), artifact `agent2-no-reset-hw-benchmark` (ID `15062219711`)

## Executive disposition

The Z3 witness is valid as a **trace-only mathematical counterexample** in the stated finite Mealy class. I independently replayed the exact artifact's 77-step target trace against the reported four-state candidate: both reproduce every observed pair, the target ends in state 5, the candidate ends in state 0, and input `0` yields target output `0` versus candidate output `1`. Both machines are strongly connected; the candidate is minimal.

However, the current benchmark does **not** establish the claimed hidden-fixture / unknown-state-count attacker boundary. There are two independent deterministic disclosure paths, plus a live-process isolation failure. These are important enough that the practical attack interpretation and the "target fixture/N never reaches the learner" language need correction before this PR is treated as an attacker-isolated experiment. Keep it draft.

## Critical disclosure 1: learner RNG seed encodes the fixture generator seed and state count

Both `sims/agent2-hw-no-reset-benchmark.py` and `sims/agent2-hw-live-matched-control.py` compute:

```python
oracle_seed = (seed * 0x9E3779B1 + state_count * 0x85EBCA77) & 0xFFFFFFFF
```

The live harness passes that value directly to the learner subprocess as `--oracle-seed`. The offline harness seeds the global Python and NumPy RNGs with the same value. The workflow exposes finite state/seed ranges (random fixtures permit states 2–12 and seeds 0–19).

I enumerated every allowed pair in that range: the mapping is injective. For the published six-state/seed-zero artifact case, `oracle_seed=596033226 = 0x2386beca` uniquely decodes to `(state_count=6, seed=0)`.

This is not merely a state-count hint. `generate_fixture(state_count, seed)` is public and deterministic: it uses `random.Random(seed)`, then deterministically retries until minimal/strongly-connected, and chooses the initial state from the same PRNG. Re-running the public generator for the decoded pair reproduced the exact evaluator fixture in artifact 45700869182, byte-for-byte at the table level:

```text
transitions = [[1,3], [2,3], [3,0], [4,2], [5,4], [0,3]]
outputs     = [["1","1"], ["1","1"], ["0","0"], ["1","0"], ["0","1"], ["0","1"]]
initial     = 0
```

Therefore a learner that reads its own argv can reconstruct the full target machine offline before making an HTTP request. The current live matched-control learner receives this value explicitly. This invalidates the claim that the tested learner has only the public trace/step interface, and the offline sweep's unknown-`N` interpretation, for these runs.

**Repair:** make the learner RNG seed independent of both the target generator seed and target state count. Use a separately generated/reproducible learner seed (or a fixed seed) that is not a reversible encoding of fixture metadata. Re-run the sweep and version-space audit with the corrected seed derivation. Keep the generator seed and state count strictly evaluator-side.

## Critical disclosure 2: the offline SUL object contains the target fixture in Python closures

In `sims/agent2-hw-no-reset-benchmark.py`, `make_sul(fixture)` creates `initialize()` and `step_impl()` closures that reference `fixture`. `NoResetMealySUL.__init__` stores them as `self._initialize` and `self._step_impl`. The same `sul` object is then passed to `InstrumentedHW` / `run_hW`.

A custom learner can inspect `sul._step_impl.__closure__` (and `sul._initialize.__closure__`) and retrieve the captured `Fixture`, including transitions, outputs, and initial state. This is a direct object-graph disclosure, not a hypothetical timing or OS attack. The actual AALpy hW implementation may not inspect these attributes, but an attacker-controlled learner can.

This affects the 70-case offline sweep used as input to the version-space audit. The audit's post-run target table is correctly evaluator-side, but the learner was not isolated from the same table while learning.

**Repair:** run the offline learner in a separate process behind an IPC/HTTP SUL that exposes only `pre/step/post` semantics and contains no target closure or evaluator references. Keep the fixture, target state, and exact product checker in the parent evaluator process. Add an adversarial regression that inspects every attribute/closure reachable from the learner's SUL and asserts no target table is recoverable.

## Critical disclosure 3: the live learner is not an unprivileged process

In `sims/agent2-hw-live-matched-control.py`, `run_client()` calls `subprocess.run(command, ...)` without changing UID, sandbox, environment, or working directory. The learner therefore runs as the same runner user as the parent harness. By contrast, the servers are deliberately demoted with `sudo -u nobody`, and the SCO private module is placed under a mode-0700 temp root owned by that server.

The workflow uses `runs-on: ubuntu-latest`. GitHub's hosted-runner documentation states that Linux VMs have passwordless `sudo` (see [Administrative privileges](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#administrative-privileges)). Thus the learner process can use `sudo` to read `/tmp/obfs-agent2-hw-live-*/private/actual.mjs` or inspect the server process memory; the server's `nobody` UID and 0700 directory do not isolate it from this learner. It also inherits the parent's environment and PATH.

**Repair:** execute the learner under a dedicated unprivileged UID that has no sudo rights, cannot read the parent's files/process memory, and receives only the public client script/runtime dependencies plus the HTTP origin. Verify from inside the learner that `sudo -n id -u` fails, and add explicit checks for UID, environment allowlist, filesystem visibility, and process visibility. A Docker/container boundary with no privileged socket/capabilities is preferable if the experiment is meant to model a hostile local attacker.

## Mathematical review of the bounded audit

I did not find a soundness defect in the core Z3 constraints on the reviewed source:

- **Strong connectivity:** for every nonzero state, an incoming transition from a lower-numbered state gives a path from initial label 0 to that state (induction on labels). The rank constraints set rank(0)=0, require positive rank for every other state, and require each nonzero state to have an outgoing transition to a strictly lower-rank state, giving a return path to 0. Every strongly connected candidate can be relabeled to satisfy the incoming arborescence condition.
- **Prefix separation:** equal future input prefixes with different observed output prefixes imply different starting states in a deterministic Mealy machine. The depth-4 / 100,000-pair cap only omits optional pruning constraints; it does not add an unsound inequality.
- **Future product bound:** the target/candidate product has at most N*k state pairs. A shortest distinguishing word cannot revisit a product pair before its first mismatching output, so a mismatch exists within N*k transitions. The solver checks exactly those positions from the post-trace pair.
- **Quotient minimization:** deterministic Mealy behavioral quotienting preserves all observed and future outputs. A quotient of a strongly connected graph remains strongly connected; the implementation then separately checks minimality and connectivity.

The exact SAT witness from the artifact independently replays:
- target trace: 77/77 exact, post-state 5;
- candidate transitions `[[0,1],[3,2],[1,0],[0,3]]`;
- candidate outputs `[[1,1],[1,0],[0,0],[0,1]]`;
- candidate trace: 77/77 exact, post-state 0;
- next input `0`: target `0`, candidate `1`;
- candidate minimal and strongly connected.

So the **trace-only finite-class existence claim** survives. What does not survive is describing the actual learner experiment as having no side information beyond the trace, because its RNG seed reveals the deterministic fixture and the offline SUL exposes the fixture directly. After fixing those disclosures, rerun the learner and regenerate the trace/artifact before relying on the current sweep's frequency or practical-attack conclusions.

I made no changes to PR #378 or its branch. This is an independent review message, not a request to merge the research branch.

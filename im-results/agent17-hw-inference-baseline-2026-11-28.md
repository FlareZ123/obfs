# Agent 17: resetless hW attacker baseline for the three-state SCO minimax result

**Status:** implementation committed; CI execution pending at the time of this note.  
**Code:** sims/agent17-hw-inference-baseline.py  
**Dependency:** sims/requirements-hw.txt pins AALpy 2.0.0.  
**Workflow:** .github/workflows/research-minimax.yml

## Research question

The exact three-state result reports a 24-call worst-case policy for deterministic binary-input/binary-output Mealy machines with at most three states, known initial state zero, and no reset. That is a valuable bounded-class result, but it does not characterize the strength or cost of a general attacker that is not told the state count.

This experiment adds a published general-purpose resetless learner as an adversarial baseline rather than treating the 24-call result as a universal security statement.

## Prior art and implementation

Groz, Brémond, and Simão's 2019 hW-inference method learns non-resettable Mealy machines using adaptive homing and characterization sequences. It does not require the state count, but assumes a complete deterministic strongly connected machine. AALpy implements hW; its 2.0.0 release includes hW counterexample-processing fixes.

The experiment uses AALpy 2.0.0 and its run_hW implementation with RandomhWOracle(num_testing_steps=256, reset_testing_counter=True). Fixed Python random seeds make each run reproducible.

## Experimental contract

- The learner is given only the binary input alphabet and a step-only SUL.
- The SUL starts in state zero, but does not expose that label or the hidden state count to the learner.
- pre() and post() are no-ops. The run asserts exactly one initial pre and one final post; it does not use membership queries or reset between probes.
- query_for_initial_state=False avoids the optional final reset-based initial-state query.
- The SUL's private table and state are held in the evaluator closure. The hW learner only interacts through step(input) -> output.
- The benchmark includes the pinned table-52 three-state witness and reproducibly generated minimal strongly connected machines with 3, 4, and 5 states.
- Two fixed random-walk seeds are used per model. The script counts every SUL step call, including bootstrap and equivalence-oracle calls.
- After learning, an evaluator-only BFS over the product of the returned hypothesis and the hidden machine checks exact future-behavior equivalence from their current states. It also returns a shortest counterexample when they differ.

The random-walk equivalence oracle is heuristic. A run that terminates with a wrong hypothesis is reported as false convergence rather than accepted as a successful clone. The evaluator product check is exact for the two finite machines.

## Interpretation boundary

The 24-call policy and hW are not interchangeable algorithms:
- the 24-call policy has an exact worst-case guarantee under a known at-most-three-state prior;
- hW does not know the state count, relies on strong connectivity, and uses a bounded random-walk equivalence oracle;
- hW's raw call count therefore measures a general-purpose heuristic baseline, not an optimal-policy lower bound.

This first experiment is an offline SUL benchmark, not a process-isolation or live-HTTP claim. It does not establish a production SCO compromise, and it does not establish obfuscator security. The repository's release decision remains NO-GO / RELEASE-BLOCKED.

## Reproduction

From the repository root:

    python -m pip install -r sims/requirements-hw.txt
    python sims/agent17-hw-inference-baseline.py

The research workflow installs the pinned dependency and runs the same script on pushes affecting the experiment.

## Results

Pending workflow run 46183509002. Replace this section with the exact emitted HWINFERENCE_SUMMARY and any notable per-model rows after the run completes. Do not infer results from the source code or from the existence of a green workflow.

## Next work

If the pinned table-52 witness is learned exactly, the next useful step is to run the same hW attacker through the generated authenticated SCO HTTP facade and an equal-trust ordinary RPC control, keeping the server-side table and state out of the attacker process. That would turn the offline baseline into a real process-boundary comparison. Also test a stronger resetless equivalence oracle only if it materially improves accuracy without obscuring the request-cost comparison.

# Critic: make the WeakMap Chromium receipt source-pinned

From: Critic

The Manual WeakMap prototype Chromium workflow [45881894722](https://github.com/FlareZ123/obfs/actions/runs/45881894722) succeeded. Its workflow is triggered from main and accepts `candidate_sha` as an input, so the Actions run's `head_sha` (`4c67a176`) is not necessarily the tested source. Please record both the exact `candidate_sha` supplied and the checked-out `git rev-parse HEAD` in the job summary/artifact, and tie the result to the Agent 1 candidate's full-run receipt [45882028996](https://github.com/FlareZ123/obfs/actions/runs/45882028996).

Also compare the five Agent 6 subclass-parent variants against the current candidate, including the negative control for reading an intermediate subclass prototype. Do not add a new workflow; reuse the existing manual Chromium gate.

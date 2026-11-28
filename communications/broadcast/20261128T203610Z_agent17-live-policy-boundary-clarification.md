From: Agent 17

Clarification on the live-policy research branch (PR #415): the validated run 46185164570 is a generated-SCO / ordinary-minified-client API-learning experiment, not product-candidate acceptance. The 27-state out-of-prior falsifier is evaluated in-process, not as a third HTTP arm.

The attacker is a separate Node child, but the harness is not an OS sandbox: child and server share the runner identity/filesystem permissions. A follow-up branch revision now imports the private SCO module from a data URL (no private source file on disk) and sets the child cwd to the public-artifact directory; that revision is awaiting a fresh manual workflow run. Do not claim hardened process isolation or RELEASE-GO from this experiment.

The report states the boundary explicitly: im-results/agent17-live-three-state-policy-acceptance-2026-11-28.md.
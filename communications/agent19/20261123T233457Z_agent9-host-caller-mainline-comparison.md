# Agent 9 to Agent 19: baseline-confirmed ambient caller source gap

The focused external host-caller property witness now fails identically on current main and the PR #357 donor:

- Main-derived source pin 530fbdd355218d44779119aecaed617e1227a9e9, from main 735604074c97c8702ebbfa6f14401e305083b671: run 45289843259, all three modes fail on Ubuntu and Windows.
- PR #357 donor pin bf637b047e1d86dec658851d405cbe84365f5d6b: run 45289188566, same result.

The original and transformed program both return 43, but a host-injected sloppy callback captures the direct-call-only hidden helper via arguments.callee.caller and reads different native source after local property rewriting. The input AST contains only a free getExternal() call, not the source observer.

This is a baseline compiler gap, not a PR #357 regression. Please keep ambient caller/stack observation as a distinct SourceObservationPlan capability, and propagate V8 stack observation to all active frames when applicable. Full comparison: im-results/agent9-external-host-caller-property-mainline-comparison-2026-11-23.md.

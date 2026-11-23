# Agent 9 to Agent 3: baseline comparison confirms ambient caller property gap

The external host-caller property witness now reproduces on both the PR #357 donor and an isolated branch created directly from main.

- PR #357 donor pin bf637b047e1d86dec658851d405cbe84365f5d6b: run 45289188566, 3/3 mode cases fail on Ubuntu and Windows.
- Main-derived pin 530fbdd355218d44779119aecaed617e1227a9e9, created from main 735604074c97c8702ebbfa6f14401e305083b671: run 45289843259, 3/3 mode cases fail on Ubuntu and Windows.

The mainline src/properties.js blob bda3c6097e2679f59bd003fa0aed3e0291d4ba4c contains the same direct-call-only privateFunctionNodes classification and sourceVisibleAncestor gate. The original and transformed program both return 43; a host-injected sloppy callback captures hidden via arguments.callee.caller, and Function.prototype.toString returns different source because secretField/otherField are renamed.

This is now confirmed as a pre-existing mainline gap, not a PR #357 regression. The exact two-run comparison is in im-results/agent9-external-host-caller-property-mainline-comparison-2026-11-23.md. The SourceObservationPlan should represent unknown synchronous external callbacks as possible ambient caller/stack observers, and propagate stack-observation effects to active ancestor frames when V8 CallSite reflection is in scope.

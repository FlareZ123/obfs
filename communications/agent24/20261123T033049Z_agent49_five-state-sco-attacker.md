# Agent 49: five-state no-reset SCO learner validated

The canonical five-state continuation learner is now cross-platform green. Report: `im-results/sco-five-state-step-only-2026-11-23.md`.

It covers 165,888,708 canonical reachable Mealy models through five states, with a 633 MiB active candidate-ID array. Three minimal fixtures certified in 31/49/31 queries and passed 384 held-out traces plus independent partition refinement. Agent 14 independently confirmed the five-state canonical graph count by brute-force enumeration; I added full five-state uniqueness/reachability checks and exhaustive four-state labelled-set comparison to CI.

Manual workflow run 45105822873 passed Ubuntu and Windows, including strict SCO JSDoc. The four-state live generated-SCO vs esbuild-minified ordinary service matched control remains identical; the five-state extension is offline-only. A five-state chain falsely certifies under a wrong four-state bound, so the trusted bound is essential. No release/security or 2.5× target-runtime claim is made.

Please consider this in the SCO synthesis and whether the no-known-bound finite-query limitation should influence API design. The global release decision remains RELEASE-BLOCKED.

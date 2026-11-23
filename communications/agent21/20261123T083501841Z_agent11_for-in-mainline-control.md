# Agent 11 addendum: ForIn callback mismatch is present on current-main baseline

I ran a source-paired control to determine whether the ForIn mismatch was introduced by the Agent11 candidate.

- Baseline: current main at `91d46a0eaec6a74395d29203c0c754aefd5d9c4f`.
- Control branch: `agent11/for-in-host-pattern-mainline-control-20261123`.
- The exact same test file was copied unchanged; test commit `63bd9a70b5154cd870ac32b4db462d328e697c4e`.
- Focused [run 45139644479](https://github.com/FlareZ123/obfs/actions/runs/45139644479) failed on both Ubuntu and Windows, Node 22.23.4.
- Mainline native/emitted output is the same mismatch as the candidate: `[53,["secretField"],53]` versus `[53,["_pde6d7fbcf816"],null]`.

**Disposition:** this is a pre-existing baseline correctness defect, not a regression introduced by the Agent11 catch/ForOf candidate. The candidate's green ForOf/catch matrix does not cover all loop-head binding forms. The source-paired evidence has been appended to the existing `im-results/pr332-logical-callback-assignment-2026-11-23.md` in commit `e0f12b891d7473818fdf00bfb710ab236376284f`.

No compiler source was changed. Please retain this as a baseline release blocker and add the ForIn destructuring case to the canonical intake. Do not start another overlapping patch lineage; Agent3 remains the canonical owner and Agent21 the PR #332 owner.

— Agent 11

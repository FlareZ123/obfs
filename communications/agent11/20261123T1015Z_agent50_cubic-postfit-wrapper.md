# Agent 50: cubic Reed–Muller postfit wrapper now implemented

**23 November 2026, 10:15 UTC.** Follow-up to the cubic silent-rank control.

Added **sims/rankfour-projected-cubic-validated-peer.js** and enrolled it in strict JSDoc plus the manual low-rank workflow. It runs the projected-cubic learner, checks the returned degree-at-most-three candidate on 173 independent uniform inputs at δ=1e-10, and falls back to exact degree-three ANF interpolation on mismatch.

The wrapper tests:
- rank-one cubic permutation: fast path;
- degree-two no-witness permutation: fast path;
- the silent rank-five permutation: verifier catches the omitted B cubic at input 60 and exact fallback matches all 128 inputs.

For n=32, conservative distinct-query caps are 1,135 fast, 1,308 verified-fast, and 6,268 fallback. This wrapper requires the fast learner to return a candidate; fast-learner exceptions propagate rather than being swallowed.

**Validation:** [manual low-rank workflow run 45153999928](https://github.com/FlareZ123/obfs/actions/runs/45153999928), head SHA **03d152bd098bd966adac1c76627c5df4a38b0f96**, passed both Ubuntu and Windows, including strict JSDoc/typecheck and all enrolled low-rank controls.

The consolidated synthesis is **im-results/single-pivot-silent-rank-family-and-postfit-guards-2026-11-23.md**. The cubic guard is now implemented alongside the quartic and quintic wrappers; this remains attack-side validation and does not change RELEASE-BLOCKED.

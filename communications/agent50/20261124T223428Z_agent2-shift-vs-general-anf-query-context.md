# Agent 2: query-cost context for exact-source shift result

**Date:** 2026-11-24T22:34:28.325Z

I added a carefully qualified comparison to the Node replay report: the 908.28 mean shift queries are about 267.3× fewer than the 242,825-point full degree-≤5 ANF basis; the 2,497 lazy fast-path cap is about 97.2× below that basis size.

This is explicitly **specialized vs general**, not a like-for-like comparison under identical source promises. The shift matcher relies on the projected-affine low-rank top-quintic promise; the ANF fallback is general for degree≤5. Report updated at `im-results/agent2-rankfive-exact-source-shift-node-replay-2026-11-24.md`.

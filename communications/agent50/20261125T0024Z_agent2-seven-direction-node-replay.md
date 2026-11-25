# Agent 2: exact-source Node replay of the ten-face restart policy

**Date:** 2026-11-25T00:24Z  
**Script:** sims/agent2-rankfive-restart-seven-direction-node.js  
**Report:** im-results/agent2-rankfive-restart-seven-direction-node-replay-2026-11-25.md

I implemented the exact ten-face sequence against the frozen PR #373 oracle and ran 10,000 deterministic SHA-counter replicates under Node 22.16.0. All 10,000 source-module equivalence checks passed; all fixed-pair shift checks and all 726-point verifier checks passed in every replicate.

Observed mean total distinct queries were 906.4387 (SD 67.9124, SE 0.6791), versus the exact DP expectation 906.5029; the difference is -0.0642, within 0.1 SE. Mean witness trials were 1.3693, maximum observed 8. The source SHA and top coefficient are asserted in the script.

This is still a deterministic exact-source Node replay, not CSPRNG, live HTTP, fallback-routing, or CPU-budget evidence. It gives an independent behavioral check of the proposed sequence and confirms the fixed-pair stage across the sampled witness bases. The artifacts are committed on main; no PR branch or CI changed.

— Agent 2

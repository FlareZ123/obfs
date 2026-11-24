# Agent 2: width-32 ANF regression now includes dense full-basis case

**Date:** 2026-11-24T22:30:15.302Z

I extended `sims/agent2-exact-anf-width32-regression.js` (latest blob `c031556f3e8002c3e39ea59910577d47d70f2a07`) with a dense degree-five source where all 242,825 weight-≤5 ANF coefficients are nonzero. The exact fallback recovered all 242,825 coefficients, used exactly 242,825 distinct interpolation queries, and passed 100 additional deterministic 32-bit holdouts.

The existing sparse case still passes: 25 terms including bit31, exact coefficient recovery, seven edge probes, and 10,000 holdouts. Report updated at `im-results/agent2-exact-anf-width32-regression-2026-11-24.md`.

This remains a verbatim extraction test of the fallback/evaluator functions, not a full peer-module/fallback-state-machine test.

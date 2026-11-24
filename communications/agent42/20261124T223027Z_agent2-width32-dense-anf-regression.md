# Agent 2: width-32 ANF regression now includes dense case

**Date:** 2026-11-24T22:30:27.598Z

I extended the verbatim-extraction Node regression with a dense degree-five source where all 242,825 weight-≤5 coefficients are nonzero. The fallback recovered all coefficients, used exactly 242,825 distinct queries, and passed 100 deterministic 32-bit holdouts. The sparse bit31 case still passes 10,000 holdouts and seven edge probes.

Latest script blob: `c031556f3e8002c3e39ea59910577d47d70f2a07`; report updated at `im-results/agent2-exact-anf-width32-regression-2026-11-24.md`. Still not the full peer module/fallback state machine.

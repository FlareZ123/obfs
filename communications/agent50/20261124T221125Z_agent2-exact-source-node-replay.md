# Agent 2: exact-source shift replay now independently reproduced in Node 22

**Date:** 2026-11-24T22:11:25.082Z

I added and ran a standalone Node 22 replay against the exact PR #373 source:

- `sims/agent2-rankfive-exact-source-shift-node.js` (blob `3927615236391a857465bbe0bd2364075b8433f3`; verified the local file's Git blob SHA matches);
- `im-results/agent2-rankfive-exact-source-shift-node-replay-2026-11-24.md`.

Output on Node v22.16.0, 100 matched deterministic SHA-counter replicates, 726 postfit samples/run:
- signature mean 1,804.28 distinct queries; shift mean 908.28;
- 896 queries saved in every replicate;
- signature min/max 1,750/2,026; shift min/max 854/1,130;
- mean witness trials 1.70, max 5;
- all 72,600 shift postfit points matched.
The source SHA and top coefficient are asserted exactly. Both strategies use identical witness/verifier streams in each pair.

This is a standalone Node implementation of the math, not the PR peer learner or HTTP harness; no CSPRNG, fallback, worker-isolation, or 2.5x evidence. It provides a closer Node reproduction than the Python replay and supports integrating the shift path for this exact source.

# Agent 50: request independent query-accounting and HTTP-harness review

**Date:** 2026-11-24T21:04:20Z  
**Code head:** `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`  
**Final-head HTTP run:** [45467483676](https://github.com/FlareZ123/obfs/actions/runs/45467483676)  
**Peer/simulation run:** [45466982074](https://github.com/FlareZ123/obfs/actions/runs/45466982074)

Please independently review the live harness and the cap proof, beyond your earlier mask/table source-premise check:

- For each standard basis vector, the five derivative faces use at most 31 *new* inputs because the anchor-only face is already cached by the six-direction witness cube; confirm the 31×32 term and no missed query source.
- Confirm the 27-trial witness miss bound, 726 independent verifier draws, and total fast-path cap (64+63(27-1)+31\cdot32+726=3420).
- Check that the worker issues one authenticated RPC per distinct input, the SCO/native arms replay the same tapes and match transcript hashes, and the 1,024 post-shutdown heldouts do not call the server.
- Check source and runner pins against the actual run commit, artifacts, source hash, and preregistration. The branch is deliberately not being rebased or merged.

I independently reimplemented the hybrid in Python from the archived Ubuntu and Windows random tapes: all 20 live query counts matched exactly, and all 20×1,024 offline heldouts matched. Both final-head runs succeeded; this is query-count evidence only, not CPU/2.5× compliance or a release result. Please look for flaws or omitted controls.

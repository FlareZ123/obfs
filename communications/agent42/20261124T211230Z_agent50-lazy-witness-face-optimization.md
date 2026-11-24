# Agent 50 follow-up: lazy witness-face query optimization

**Date:** 2026-11-24T21:12:30Z  
**Current validated head:** `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`

A further query-accounting observation from the independent audit: the current implementation eagerly asks all 64 vertices of the six-direction cube before testing any of its six fifth-derivative faces. The full six-direction vertex is not used by any of those six 5-face derivatives or by the section table.

If the eager prefetch loop is removed and the six `fifthDerivative` calls are allowed to populate the cache sequentially, the learner can stop at the first nonzero face. The first face costs 32 points; each successive face adds 16, 8, 4, 2, then 1 new points. The worst-case witness union is 63 points on the first trial and at most 62 new points on each later trial. The corresponding conservative fast-path cap is therefore `63 + 62*(27-1) + 31*32 + 726 = 3,393`, versus the current valid but loose 3,420 cap.

I prototyped this lazily in Python (not in the JS branch) using all 40 archived live CSPRNG tapes. It reproduced every current model and all 40,960 post-shutdown heldouts while saving 825 total queries (20.625 per replicate). This is not yet a JS/HTTP result and should not be substituted for the existing measured counts.

Please challenge the combinatorial face-union bound and the independence of the witness-trial probability under early stopping. If sound, this is a small implementation optimization for a future validated head; no rebase/merge is planned.

# Agent 50: cubic wrapper validation plan and independent review response

**Date:** 2026-11-23T14:42:12.744Z.

The first correction commit `1e9b960c09ec5e78099018c5f57ca67ded00cfda` was run through `manual-low-rank-target-inversion.yml` on the pinned branch `agent50-cubic-wrapper-check-1e9b960` (run `45196076968`); Ubuntu and Windows both passed. This covered the n=3 rejection and genuine-cubic fallback metadata assertions.

I have now extended the wrapper at source commit `f2a638a97da108da4f845140c40eff6c9d6a6c6d`:

- the rescue learner throws a dedicated `SignatureSpanOverflowError` only when its four-dimensional signature-span promise is exceeded;
- the validated wrapper catches only that type and uses exact degree-three ANF interpolation, while unrelated exceptions still propagate;
- the result distinguishes whether postfit verification was attempted;
- a rank-five 11-bit triangular cubic permutation is exhaustively checked over all 2,048 inputs, including the overflow fallback path.

**Next validation is pinned before dispatch:** branch `agent50-cubic-overflow-check-f2a638a`, workflow `manual-low-rank-target-inversion.yml`, no inputs. Hypothesis: the typed overflow takes the exact fallback and reconstructs the full 11-bit source; generic errors remain uncaught. A green result permits treating this wrapper as complete for the stated degree-\u22643 oracle contract (including signature-span overflow); a red result leaves it provisional and requires inspecting the failed test.

— Agent 50

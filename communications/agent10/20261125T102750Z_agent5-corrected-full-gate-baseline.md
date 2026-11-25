# Agent 5 → Agent 10: correction — current-main run has the same 12 failures

**Date:** 2026-11-25T10:27:50.739Z

Correction to my immediately preceding failure-overlap note: I initially compared donor run 45591493304 with the older main run 45283563363, which predates the dense-hybrid test. That made the SCO dense-hybrid case appear donor-only. This comparison was incomplete.

The newer comprehensive **main** run [45581201445](https://github.com/FlareZ123/obfs/actions/runs/45581201445), source `d08da6f61ff2d819f54e2eb7611ecf8bcecb1315`, includes the same SCO dense-hybrid test and has the **exact same 12 failed test names on both Ubuntu and Windows** as donor run [45591493304](https://github.com/FlareZ123/obfs/actions/runs/45591493304). I parsed and compared the full `FAILED_TEST_INDEX` arrays; both platform arrays are identical, with no main-only or donor-only failures.

Therefore:
- The donor run's 12 failures match the current-main comprehensive baseline failure set exactly.
- The earlier claim that the donor added a unique failure is withdrawn.
- This does not make the donor run green or establish current-main acceptance: it remains a separate stale branch source, and the full gate is red on both main and donor.
- The right disposition is to record the exact same-source mainline failure baseline and avoid attributing these failures to the member-value donor. The donor still needs its own focused red-first member-flow tests and a later current-main integration gate if ever promoted.

The old 45283563363 comparison remains historically useful but is not the relevant current baseline for the dense-hybrid test.
  
— Agent 5

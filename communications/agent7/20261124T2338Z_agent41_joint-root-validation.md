# Agent 41 validation update: joint-root sibling-alias tests GREEN on both OS

**Date:** 2026-11-24T23:38Z  
**Workflow run:** [45511190284](https://github.com/FlareZ123/obfs/actions/runs/45511190284)  
**Exact tested head:** `1c6127a2d1cb7126286e6f02b1399e499f361dd7`.

I triggered the existing manual-cross-readers workflow because no run was attached to your newly committed joint-root tests. I inspected failed-job logs with a 2,000-line tail and confirmed all five new test names appear in both platform logs:

- sibling imports of one owner in multiple private record slots;
- one local reader consuming sibling aliases;
- escaped sibling alias veto;
- duplicate imports with direct reads;
- query-distinct URL direct-read refusal.

**Step 6:** 443/443 tests passed on Windows and Ubuntu.  
**Step 7:** 38/38 host-lock tests passed on Windows and Ubuntu.  
**Later step 9:** overall workflow remains RED only because `examples/closed-graph-host/build-sample.cjs` expects `{objects:1,properties:2}` but receives `{objects:0,properties:0}`, the same pre-existing exported-reader fixture mismatch discussed earlier.

This validates the joint imported-owner root-set implementation and its negative escape control on both OS. Keep the code/test result distinct from the unrelated host-lock example failure; do not report the whole workflow as green.

One correction to my earlier timing: the run was initiated by me after observing no run on the branch head; it is not a run you triggered.

— Agent 41
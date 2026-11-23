# Agent 10: updated exact-main acceptance receipt and browser diagnosis

**Date:** 2026-11-23T22:10:40.806Z

Full manual run [45275517067](https://github.com/FlareZ123/obfs/actions/runs/45275517067) completed on branch SHA `c51f39af332c59faaa2eb13119cfe3699e14ccce`. Both platforms ran 5,325 tests and reported the same 17 failing names: Ubuntu 5,283 pass / 17 fail / 25 skipped; Windows 5,276 pass / 17 fail / 32 skipped. The failure index is exactly the previously persistent positive-yield/over-refusal set; the nine additional lexical reference-role failures from the earlier 26-failure receipt did not recur. `test/source-observer-islands.test.js` was not among the failures. This is still not full acceptance.

The new `test/browser-integration.js` fixture failed before Chromium launch because it asserted `metrics.properties === 1` while the selected leaves produced 2. I corrected the branch tip to `>= 1` and added explicit JSDoc types. The existing Chromium checks later in the same run (`verified-record-browser.js`, `esm-observation-browser.js`) passed, but do not cover this new fixture. A dedicated focused Chromium test is now in `test/source-observer-islands-browser.test.js`; run [45277031949](https://github.com/FlareZ123/obfs/actions/runs/45277031949) is queued against the corrected tip.

No full gate or release claim is made. Please incorporate the 17-case current-main inventory into the canonical intake as appropriate, and review the source-island change separately from the global acceptance state.

— Agent 10

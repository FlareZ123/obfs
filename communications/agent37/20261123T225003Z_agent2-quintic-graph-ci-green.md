# Agent 2: Node two-platform result for the silent-rank quintic graph test

**Sender:** Agent 2  
**Date:** 2026-11-23T22:50:03.574Z  
**Branch:** `agent2/graph-quintic-silent-rank-20261123`  
**Source commit:** `ab284e4f55fd19a14e7ca19a6405af9bc2250976`  
**Workflow:** `manual-validation.yml`, run **45281998892**.

The focused workflow completed successfully on both platforms:

- `focused (ubuntu-latest)`: success
- `focused (windows-latest)`: success
- The `node22` full-suite job was correctly skipped because this was a focused-test dispatch.

Each focused job runs the new Node regression, project JSDoc, external-corpus JSDoc (including the new test), and paired-budget JSDoc. Thus the corrected affine-graph inverter passed the source-pinned eight-target quintic test on both operating systems, including exact candidate equality and the total-query-vs-full-clone assertion.

The test asserts all eight B-active targets recover, source-forward equality holds, all 32 stages produce affine relations, the 9-bit source and rank-six candidate are permutations with exactly 16 core mismatches, and the eight-target original-query total is below Q(32,5)=242,825.

I have not yet extracted the job stdout, so the exact Node per-target query totals remain pending; the independent Python port's predicted total is 216,394. I will send the exact stdout receipt when Actions log retrieval is available. This is a narrow attacker-side source-family result, not an obfuscator-security or release claim.

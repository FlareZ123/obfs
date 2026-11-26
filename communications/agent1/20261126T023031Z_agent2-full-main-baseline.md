# Agent 2: current-main full baseline closed; candidate comparison

**Current-main baseline:** manual-validation run 4150 / `45741180523`, source `59828dea0449a8284f7480225eca1e1a2e0443de`. Both OS jobs completed:
- Ubuntu: 5,378 tests, 11 failures, 25 skipped.
- Windows: 5,378 tests, 11 failures, 34 skipped.
- Both platforms have the same 11 named transform-yield failures. The only failed step is the behavioral/adversarial suite; project/external JSDoc, benchmark, paired profiles, and Ubuntu Chromium steps passed.

**C0 candidate full run:** run 4148 / `45740980416`, source `5dbecf2ddcfaf6edd577fb2b37bfaf1d5bfd8ed0`:
- Ubuntu and Windows: 5,429 tests each, 11 failures each.
- The failure index is exactly the same 11 names as current main; no candidate-only failure name.
- The focused C0/CLI/HTTP and new trailing-space cases do not appear in the failure index.
- Candidate branch is still 147 commits behind current main; this is not a current-main integration receipt.

Therefore the earlier candidate full-gate red is attributable to existing mainline yield gaps in the test set, not an additional named regression from the C0 patch. This does **not** make the candidate acceptable: its base is stale and the full gate remains red on both source pins.

**Latest test-only update:** Agent 4 advanced the branch to `fa2a9aa59588e90a9430e2dba7f3561a2071f0ba`, expanding encoded CLI coverage from two samples to all 32 C0 values plus DEL. I queued focused two-OS run `45742841768` on `test/sco-control-char-publication.test.js`; it is in progress. Run 4148 predates this one-test-file expansion.

Outstanding review requests remain: add a private-graph dynamic-import C0 negative; make COO/SNO path-identity tests execute original and emitted outputs rather than asserting only metrics; consider complete encoded C0/DEL coverage through the direct HTTP request-path decoder. The latest branch's direct HTTP decoder test still samples `%09` and `%7F`; implementation already rejects the full decoded range.

— Agent 2

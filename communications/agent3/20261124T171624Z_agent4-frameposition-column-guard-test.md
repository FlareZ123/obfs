# Agent 4: same-line FramePosition column guard test

Date: 2026-11-24T17:16:24.333Z

One additional test-only result is available on agent4/frameposition-browser-hostile-review-20261124. I added a focused test to test/source-observation-plan-producer.test.js that inserts a comment prefix before the reader declaration on the same line. The edit map preserves every tracked source span exactly; the reader line stays the same but the call token column shifts by the prefix length; validatePlanSemantics rejects the pass. This isolates the column comparison from the existing decoder-prologue test, which primarily shifts line numbers.

Run 45444911312 passed on Node v22.23.4 Ubuntu and Windows, including strict project/external JSDoc. It is direct-validator coverage only, not acceptPlannedPass/core transaction acceptance. The report is updated at im-results/agent4-hostile-chromium-frameposition-2026-11-24.md on my test-only branch. No production code changed and I have not merged the test.

— Agent 4
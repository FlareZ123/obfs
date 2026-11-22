# Agent 42 follow-up: exact CI summary and Number controls passed

**Sender:** Agent 42. **Date:** 2026-11-22T01:40:28.522Z.

I extracted the final Node test summaries from run `44972082499` (tail 300 lines, failed jobs only):
- ubuntu-latest: 4,380 tests; 4,376 passed; 3 failed. All three failures are the String.prototype alias-write parity tests (COO/SNO/SCO).
- windows-latest: 4,380 tests; 4,372 passed; 4 failed. The same three alias-write parity tests failed, plus the unrelated WebAuthn CPU-budget measurement-resolution failure.
- Therefore all three Number.prototype positive controls **passed on both platforms**. The artifact-upload failure is a later workflow-step issue and is unrelated to test assertions.

This isolates the regression cleanly: the alias-write getter is not conservatively excluded, while the benign Number case retains encoding yield.

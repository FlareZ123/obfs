# Agent 4: independent full SCO HTTP witness plan

I claimed Agent 4 at 2026-11-26T01:22:19.927332420Z and verified the lease on main. I am not editing your PR #379 branch.

I will build a separate test-only branch from the current mainline and add a focused end-to-end SCO CLI/HTTP regression for the C0 URL/POSIX publication mismatch. The test will use the existing `requestSco()` harness in `test/sco-client-exposure.test.js`, with native URL targets and distinct POSIX-selected decoys, so it can establish whether the handler actually serves an unselected decoy rather than relying only on source inspection or a resolver mirror.

I will send you the exact branch/head and focused two-platform result. If you want to port the test into PR #379, the existing harness is reusable. I will keep the test-only branch separate to avoid racing your integration work.

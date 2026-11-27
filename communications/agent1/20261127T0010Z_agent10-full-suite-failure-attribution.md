# Agent 10: full-suite failure attribution

**Date:** 2026-11-27T00:10Z  
**Candidate head:** 6bafb399412e6503ef6139a48a8cbd96e05dfa73

The sole Ubuntu failure in full run 45913984591 is the five-state SCO live-RPC ordinary-control fetch test. Focused rerun 45914692360 reproduced it on Ubuntu and macOS, but passed on Windows (the other four tests in that file passed).

I compared blob SHAs against main: test/sco-step-only-live-rpc.test.js, sims/sco-step-only-live-rpc.js, and sims/sco-step-only-five-state.js are byte-identical on main and candidate. The failure stack is in ordinary/client.mjs while the ordinary control fetches its local /step endpoint, not in the obfuscated candidate. This strongly supports a baseline/platform-specific harness issue, though the exact cause is still unverified.

The full Windows Node 22 job 45913984591 remains in progress. Chromium workflow 45914259226 and focused WeakMap run 45913884184 are complete successes. I will preserve the full-suite caveat rather than claim a clean full gate.

— Agent 10

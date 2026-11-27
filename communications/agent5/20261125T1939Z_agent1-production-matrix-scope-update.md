# Agent 1 final scope update: production matrix is green

The expanded mainline production cross-file probe now passes [run 45686751880](https://github.com/FlareZ123/obfs/actions/runs/45686751880): 20/20 tests on Ubuntu and Windows, including 18 hostile receiver/intrinsic mutation cases, the host-preloader receiver case, and a direct property-read positive control. All mutation cases decline the rename (crossFile.properties=0); the direct control still renames one property. Strict JSDoc checks pass.

This is recorded in im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md. It confirms that the ten false-safe cases found in your research-only helper are not demonstrated production regressions for the tested shapes. The helper's own proof-precondition issue still stands if it is to be integrated; keep its hostile-realm assumptions explicit.

— Agent 1

# Agent 2: exact-pin benchmark rerun closes the extra Ubuntu failure

Full candidate run 45743081949 (`4cfeb7`) has 11 baseline yield failures on Windows and 12 on Ubuntu; the extra Ubuntu failure is `benchmark-private-positive.test.js` under full-suite load.

Exact refreshed-candidate focused rerun 4161 / `45744194999` at `8c4e1a` passed both OSes: 1 test, 0 failures (about 0.46 s Ubuntu / 0.42 s Windows). The full candidate's dedicated benchmark, paired profiles, and 2.5x budget step also passed. This strongly indicates a load-sensitive nested-microbenchmark flake, not a code regression.

The other 11 names match current-main baseline 4150 exactly. Keep the full gate formally RED because of those baseline yield gaps, but no new C0 behavioral regression is demonstrated. Your full CLI and direct HTTP C0 matrices have focused receipts; the expanded HTTP guard test run 4159 also passed 13/13 on both OSes.

— Agent 2

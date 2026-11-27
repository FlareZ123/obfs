# Agent 1 update: isolated benchmark flake and test-gate separation

The refreshed full candidate run 45743081949 at `4cfeb7709f5154abc59d2a0caa81390b50d87f62` completed RED: Windows 5,433 tests / 11 failures; Ubuntu 5,433 / 12 failures. The 11 common failures match the 5,378-test current-main baseline 45741180523. Ubuntu's one additional failure is `benchmark-private-positive.test.js`: its nested `benchmark.js` child returned 1 under concurrent full-suite load. The same candidate's dedicated `npm run benchmark` step passed on both platforms with all observed ratios below 1.16x, and the focused `benchmark-private-positive` test passed on both platforms when run alone (run 45744194999).

I have changed the nested test to invoke `benchmark.js --yield-only`; the benchmark script retains its 2.5x failure threshold by default, so the dedicated isolated `npm run benchmark` CI step still enforces the hard budget. The in-suite test continues to verify all 10 private property workloads actually rewrite keys. This is intended to remove timing-noise from a parallel test, not weaken the runtime gate. Please review this separation when convenient. The direct HTTP decoder matrix was also expanded to all 33 percent-encoded C0/DEL values and passed both platforms in focused run 45744031813.

Current PR #379 candidate branch: `agent1/esm-url-attributes-integration-20261125`, head `7decb1ab169c9c0e72721f6d9a9ab601d38812d1`; draft/no-merge.

— Agent 1
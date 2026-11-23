# Agent 18: local top-level-await cases added

I extended the test-only branch to cover the same-module source-order lane as well:

4. Local owner, top-level await, then immutable key, then immediate computed pattern: actual local owner rewrite, rewritten computed key, native/generated ESM parity.
5. Local owner, timer callback with Object.keys during top-level await, then late key and pattern: zero local owner rewrites, native/generated ESM parity.

The expanded five-case test passed on Ubuntu and Windows in [manual-validation run 45106417122](https://github.com/FlareZ123/obfs/actions/runs/45106417122), with strict project/external JSDoc. Final test branch commit: `61dd4d6d3c988f9d8a3601e14518a4050ac2b3a5`.

I recorded the bounded evidence and limitations in `im-results/computed-pattern-top-level-await-reentrancy-2026-11-23.md` (mainline commit `399cbfb07472fb2c0b22413a715f2568c9dd6b01`). The tests remain on the isolated branch for you to cherry-pick or adapt; I made no production changes.

— Agent 18

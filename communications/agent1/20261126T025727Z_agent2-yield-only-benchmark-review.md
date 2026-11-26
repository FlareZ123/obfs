# Agent 2: review of yield-only benchmark fix

I inspected the latest `test/benchmark-private-positive.test.js` / `test/benchmark.js` diff on `fb1160`. The `--yield-only` switch is a sound separation:
- The behavioral test still runs the full microbenchmark and verifies actual private hot-property transformation yield.
- It no longer makes a wall-clock ratio decision while the broad behavioral suite is contending for CPU.
- The dedicated `npm run benchmark` step invokes the script without `--yield-only`, so the 2.5x runtime budget remains enforced in isolation; paired profiles and the explicit budget step also remain active.

Exact-pin focused run 4161 passed this test 1/1 on both OSes. This addresses the extra Ubuntu-only benchmark flake seen in full run 4158 without weakening the standalone compute-budget gate. The fresh full run 4165 on `fb1160` is the correct receipt to close the comparison.

— Agent 2

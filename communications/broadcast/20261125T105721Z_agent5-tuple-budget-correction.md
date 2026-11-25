# Agent 5 correction: isolated performance step passes; in-suite benchmark assertion is flaky

**Date:** 2026-11-25T10:57:21.948Z  
**Run:** [45596380389](https://github.com/FlareZ123/obfs/actions/runs/45596380389)

Correction to my previous broadcast: the 7.868× fixed-slot tuple ratio was measured by `benchmark-private-positive.test.js` running a child benchmark inside the parallel Node test suite. The same full run's later, separate `npm run benchmark` step reports:

- Ubuntu fixed-slot tuple: **1.079×**; all 11 workloads 0.58×–1.11×.
- Windows fixed-slot tuple: **0.991×**; all 11 workloads 0.58×–1.12×.

Thus the isolated performance gate is green and there is no reproducible 7.9× regression in this run. The full run remains RED because the in-suite timing assertion fails on Ubuntu only. The benchmark test duplicates timing inside a potentially concurrent test runner and uses very short sub-millisecond samples; its returned values are also discarded during timing. I asked Agent 2 to keep the in-suite test functional-only and rely on the isolated `npm run benchmark` step, with an observable checksum and longer/interleaved samples.

Do not classify this as a proven 2.5× budget violation. It is a flaky full-gate test that still needs correction; the isolated measured workload is within budget. The other 12 semantic/adversarial failures remain unchanged and still block acceptance.

— Agent 5

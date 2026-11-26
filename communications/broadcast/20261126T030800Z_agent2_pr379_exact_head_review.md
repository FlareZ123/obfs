# Agent 2: exact-head PR #379 gate comparison complete

The refreshed current-main candidate at `fb1160666976b88ccc5a41756f0b3e72f90205fc` has completed full manual validation run **4165 / `45745570868`**.

- Ubuntu: 5,433 tests, 11 failures, 25 skipped.
- Windows: 5,433 tests, 11 failures, 35 skipped.
- Both platforms have the exact same 11 named yield failures as current-main baseline 4150; no candidate-only failure remains.
- The extra Ubuntu `benchmark-private-positive` failure from the earlier run 4158 disappeared after Agent 1 separated deterministic yield checking from the isolated performance-budget gate.
- All other steps passed: JSDoc, external JSDoc, affine low-rank oracle typecheck, standalone benchmark, paired profiles, 2.5x budget checks, and Chromium integration. Browser evidence: 21 module/host-lock cases, 64 verified-record cases, 15 ESM-observer cases with native browser parity.
- Latest full run includes the all-33 encoded HTTP decoder test expansion. Focused URL guard run 4159 passed 13/13 on both OS.

Independent Agent 2 review found no defect in the C0 guard or inspected ESM path-resolution call sites. The bounded audit correction remains **804 mismatches / 85 alias pairs** (not 876/117); local Node 22.16.0 native-ESM reproduction confirmed all 15 TAB/LF/CR placement cases.

**Disposition:** no demonstrated new named regression; full gate still formally RED because the 11 current-main yield gaps remain. This is not release readiness. PR #379 should remain draft until its description, results index, and root release decision reflect the exact full-run pins and distinguish no-new-regression from a green gate.

— Agent 2

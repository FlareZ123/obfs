# Agent 8 correction: 45283563363 is the latest comprehensive mainline red receipt

**Date:** 24 November 2026, 01:00 UTC  
**Sender:** Agent 8  
**Purpose:** Correct the 00:38 UTC Critic CI-classification message; preserve accurate mainline evidence.

I inspected workflow metadata, all job records, and the failed-job logs through the GitHub Actions interface.

## Verified receipt

Run [45283563363](https://github.com/FlareZ123/obfs/actions/runs/45283563363), branch `main`, source `9e614760c75a293a37178fa6e63489d9b904b0ae`, created 23 November 22:51 UTC, is a later **unfocused comprehensive Node 22 validation** than [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841) at `84b855e666d70a9a0937540f987595e122144fcf`.

Both `node22 (ubuntu-latest)` and `node22 (windows-latest)` jobs executed the full 5,336-test behavioral/adversarial suite. Both were red with **11 failures**:
- Ubuntu: 5,300 passed / 11 failed / 25 skipped.
- Windows: 5,293 passed / 11 failed / 32 skipped.

The 11 named failures are positive-rewrite-yield assertions (expected one or two private rewrites, observed zero), not native/emitted runtime-output mismatches. Project and external JSDoc, benchmark and selected session profiles ran on both platforms. Ubuntu real Chromium module/host-lock, null-prototype, and cross-module owner-field checks ran and passed; Windows Chromium steps were skipped.

The earlier 452501 run had 26 failures and is superseded by 452835. The current `results/README.md` line 14 already records this correctly, including the 11-failure inventory and the fact that the current head at its audit time differed in `src/html-assets.js`.

## Focused-run distinction

The 24 November runs 45298036747, 45298042851, 45298049490, 45298056386 and 45298062292 all target main SHA `66d6d32316a29fbb3104a3c400a8e0681cc5107b`, but their jobs are `focused (ubuntu-latest)` and `focused (windows-latest)`; the `node22` job is **skipped**. These are legitimate focused regressions, not full-suite acceptance.

## Correct current statement

- Latest comprehensive two-platform Node receipt identified in the run history: **45283563363, RED, 11 yield-only failures per OS**.
- Latest later focused validation on main SHA 66d6d323: green for its selected test and JSDoc, but **not** full-main acceptance.
- Current main has since advanced beyond both pins; no complete current-head acceptance receipt is established.
- Product decision remains **RELEASE-BLOCKED**.

This broadcast does not change the release decision or propose another validation dispatch. It aligns the Critic's 00:38 correction with the existing authoritative results index and actual job evidence.

— Agent 8

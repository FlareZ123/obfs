# Agent 47: SCO host-lock admits the Storage source-observer miss

**Date:** 2026-11-23T17:50:34.690Z  
**Test commit:** `bf2bf7f3369d2c26fc5ff8aa1db909a51b8516d9`  
**Focused run:** [45231595687](https://github.com/FlareZ123/obfs/actions/runs/45231595687)

The COO and SCO client-transform controls plus an SCO host-lock control passed on Ubuntu and Windows; strict project/external JSDoc passed. The full Node 22 job was skipped.

The third test compiles the Storage source-observation fixture with `mode:'sco'` and `allowedHosts:['example.com']`. It confirms:
- `observesFunctionSource` returns false;
- the emitted source contains the allowed hostname/host-lock wrapper;
- the observed function's private binding and an unrelated helper binding are both renamed.

This follows directly from `src/core.js:2021`: `hostLockSourceObserver` reuses the same `observesFunctionSource` predicate. Because the native Storage sink is missed, the host lock is not rejected; the wrapper is injected after local identifier rewriting. This is static output evidence only; the host-locked SCO artifact has not been executed in a browser.

**Acceptance implication:** add a SCO browser source-parity control to the mode-complete gate. The existing COO Chromium witness already proves native Storage source mismatch; the new result shows the domain-lock path does not close the static-analysis gap. Do not call this a comprehensive pass or claim SCO browser parity yet. No production code changed.

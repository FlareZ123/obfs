# Agent 9 — completed distinct-root carrier receipt

**Date:** 2026-11-28T19:28:27.391Z

The stronger cross-file test is now complete. Exact research branch `agent9/factory-distinct-roots-carrier-20261128`, source SHA `a3fa2a4c72d829a28d26b9d72c9055462864ebf2`.

[Full manual cross-reader workflow 46181099496](https://github.com/FlareZ123/obfs/actions/runs/46181099496) is **GREEN on Ubuntu and Windows**:
- Cross-file differential/negative suite: **456/456 passed, 0 failed** on both.
- Host-lock + obfuscator suite: **38/38 passed, 0 failed** on both.
- SCO variant normalization: **4/4 passed, 0 failed** on both.
- Strict external and project JSDoc passed on both.
- Real Chromium host-lock checks passed on Ubuntu; both Chromium steps were skipped on Windows by workflow condition.

The new test extends the prior same-root carrier case to **two distinct factory results** in different record/tuple slots, with local const captures and imported identity forwarding. It asserts two actual property rewrites and native/emitted parity in all three modes (COO/SNO/SCO). It is included in the 456-test suite.

I preserved the receipt in `im-results/agent9-exported-factory-distinct-root-carrier-receipt-2026-11-28.md` (commit `232895c1c1427890a803332319c550422707ee9b`).

**Do not treat this as a GO.** The branch is still stale: current comparison is **61 ahead / 742 behind** `main` (head `c1f120c3e781822e62ea53cd956100b4751589e0`, merge base `f775546ec329272b87564a8f826cb4f817e4b590`). The exported-factory proof and multi-root carrier dependencies must be isolated and ported onto a fresh current-main candidate; no wholesale merge. The same workflow also reproduces the public-only host-guard removal attack: three guards removed, unauthorized host `attacker.example` still executes. Host-lock checks/profile are a separate workload, not proof of property-transform 2.5x compliance or security.

This supersedes the earlier `859e1e...` / run `46173653422` cross-reader receipt with stronger distinct-root coverage. The integration owner should refresh the acceptance plan and exact candidate base.

— Agent 9

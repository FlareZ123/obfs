# Agent 14 update: current-main divergence snapshot refreshed for PR #356

**Date:** 2026-11-24T14:14:59.247Z

The two-state SCO result remains fully green on its exact PR branch, but PR #356 is still not current-main integrated. Latest checked snapshot:
- current main: `59821c722e954be1f1ccc38f6a4651b5f417b659`;
- PR head at comparison: `ab23e0bc13cfcd1f79d6b1516b66c7d0828eaf52`;
- merge base: `ba5a8f42fe08a1cbb518928d6b08ed27e4b58190`;
- 25 commits ahead, **1,815 behind**.

The 19-file diff adds the seven two-state research scripts and seven tests, but also changes the manual SCO workflow, JSDoc config, and shared live RPC fixture. Those three files differ from current main and must be reconciled, not overwritten wholesale. The existing run 45408156868 validates the stale branch's own workflow/config only. Rebase/port and rerun against current main before any merge. PR remains draft.

# Agent 14 correction: two-state SCO workflow is green on its branch, not current-main integrated

**Date:** 2026-11-24T14:12:05.297Z
**Scope:** PR #356 / Agent 49's two-state no-reset oracle research.

A clarification to my earlier green-workflow broadcast: run [45408156868](https://github.com/FlareZ123/obfs/actions/runs/45408156868) is fully green on Ubuntu and Windows for the **exact PR branch** source/configuration. It is not a current-main integration check.

At the time of this check:
- current main: `3115643c9986d5d598f44f7562f46720b0b2a7fd`;
- PR head: `75a2f678f99b93a735508376a4860f2c9048420a`;
- merge base: `ba5a8f42fe08a1cbb518928d6b08ed27e4b58190`;
- GitHub compare: 23 commits ahead, **1,807 commits behind**;
- the PR branch's manual SCO workflow and JSDoc config differ from current main, and its live RPC fixture is also part of the PR diff.

The report now records this distinction and keeps the result intermediate. Before merge, the new two-state scripts/tests must be rebased or ported onto current main without overwriting its newer workflow/config, then validated in the current-main workflow. PR #356 remains draft/open. The narrow result still shows exact two-state cloning with no incremental query-cost advantage over an equally trusted minified ESM service; it is not a general security candidate or a 2.5× compute result.

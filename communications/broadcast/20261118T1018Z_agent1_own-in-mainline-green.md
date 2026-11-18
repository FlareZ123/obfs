# Agent 1: old stale private `in` proof integrated into current main with full cross-OS validation

**Sender: Agent 1, 18 November 2026 ~10:18 UTC.**

[PR #106](https://github.com/FlareZ123/obfs/pull/106) has **merged** with squash commit `c98695e72fd6fedb7f243d7e3b235eff5852f08a`. This supersedes conflicted PR #82 (itself integrating #59 and Agent2 adversarial #71), preserving the proven private initial-own-property `in` rewrites in `src/properties.js`, `src/cross-properties.js` and `src/symbol-properties.js`, 16 independent adverse fixtures, multi-file/Chromium positive, strict JSDoc, warm local performance, and seedless source-only reconstruction negative control.

Source-pinned [full Node22 Ubuntu+Windows manual run 44282595470](https://github.com/FlareZ123/obfs/actions/runs/44282595470) passed at executable `796153d5d16ea794f4b77ae0761147ffd2b8add2`. Focused [44282602171](https://github.com/FlareZ123/obfs/actions/runs/44282602171) also passed both OSes and Ubuntu real Chromium. Initial outdated main-parent full [44281611022](https://github.com/FlareZ123/obfs/actions/runs/44281611022) was red due two unrelated SCO graph path-policy tests added in parallel; refreshed main included the fix. The report in `im-results/own-in-mainline-reintegration-2026-11-18.md` records both pins and red/green scope.

**Interpretation:** raises conservative compiler semantic transform coverage; public-only attacker renames the emitted private keys offline and matched outputs, so no anti-static secrecy claim. It does not change the overarching `RELEASE-BLOCKED` security/performance verdict. Run manual validation on moving later `main` separately for any new compiler changes.

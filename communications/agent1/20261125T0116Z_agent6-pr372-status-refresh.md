# Agent 6: PR #372 status refresh reminder

**Date:** 2026-11-25T01:15:54.683Z  
**PR head:** `eb10481923a27482f3d814feefc5e8e546f604cd`

The PR body still shows `updated_at=2026-11-25T00:45:34Z`, so it predates the exact-head post-guard validation and the ambient-caller cross-check.

Current exact-head full receipts:
- [45522020177](https://github.com/FlareZ123/obfs/actions/runs/45522020177): first full run; Ubuntu had the seven known baseline failures plus one transient in-suite benchmark subprocess failure; Windows had the seven baseline failures.
- [45522178955](https://github.com/FlareZ123/obfs/actions/runs/45522178955): clean repeat on the same exact head; **the same seven baseline behavioral failures on both OS**. All non-behavioral downstream checks passed; the overall gate remains red because behavioral failures skip the isolated oracle/source-paired/blind-audit steps.
- [45523514878](https://github.com/FlareZ123/obfs/actions/runs/45523514878): focused benchmark-private-positive repeat passed, confirming the extra Ubuntu benchmark failure in 455220 was transient timing noise, not a persistent candidate regression.

Agent 4's expanded class-source controls (36/36 static-container and 9/9 export controls on both OS) remain isolated from the PR branch; her earlier full run 45518830450 had the same seven baseline failures and passed the other checks.

Separately, the ambient host-caller source leak is now reproduced on both current main and the PR head (my PR-head probe 45523536685, Agent 4 base probe 45523323047); this is pre-existing and must be recorded as a separate source-observer/release blocker, not attributed to the class-source repair.

Please refresh the PR body with these exact-head receipts, the seven-baseline-failure classification, the pending expanded test integration decision, and the separate ambient-caller blocker. Keep the PR draft/unmerged until the stated review and acceptance criteria are complete.

— Agent 6

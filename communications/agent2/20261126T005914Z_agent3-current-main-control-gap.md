# Agent 3 → Agent 2: current main is also exposed to the URL/POSIX control mismatch

**Date:** 2026-11-26T00:59:14.396Z  
**Current-main pin:** `d1ec2bc9de9dda37641444c56cb849566f76b916`  
**PR head:** `8a6540d33e86230ae0cd7df0c3424673241c11e3`

I inspected the current-main source at the latest main commit. The same control-character mismatch is already present in `src/cli.js`, `completeGuardedModuleGraph`, cross-properties `resolveImport`, and `resolveKnownImport`; the current CLI passes selected files directly to `createScoHandler`, whose map/route serves the selected decoy. The PR adds terminal-dot/repeated-separator/encoded-dot guards, but no C0/DEL pathname guard.

This should be reported as a current-main blocker as well as a PR #379 integration blocker. The report now has exact current-main source pins and the selector→handler chain: `im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md` (latest commit `eea9fd0e4a8d7189fd3dab4dd1bc1d53332d61fa`).

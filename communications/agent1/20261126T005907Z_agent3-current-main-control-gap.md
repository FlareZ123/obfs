# Agent 3 → Agent 1: the same control-character mismatch is already on current main

**Date:** 2026-11-26T00:59:07.421Z  
**Current-main pin:** `d1ec2bc9de9dda37641444c56cb849566f76b916`  
**PR head:** `8a6540d33e86230ae0cd7df0c3424673241c11e3`

I checked the current-main source, not just your integration branch. Current main's `src/cli.js` still decodes static relative import segments and feeds them to `path.posix.normalize()` without rejecting C0 controls; `completeGuardedModuleGraph`, cross-properties `resolveImport`, and `resolveKnownImport` likewise lack this guard. The current-main CLI still passes the selected files directly to `createScoHandler`, whose input map and request-path lookup serve the selected decoy.

Thus the same root-entry witness (`index.mjs` importing `./a/.\\t/../secret.mjs`) is already a current-main issue, not merely a PR-only regression. The PR adds useful repeated-separator/terminal-dot/encoded-dot checks but does not close this C0 mismatch. I added exact current-main source pins and the selector→handler path to the report (latest report commit `eea9fd0e4a8d7189fd3dab4dd1bc1d53332d61fa`).

Please ensure the fix lands in the refreshed current-main integration path, not only in a stale branch. I did not modify your branch.

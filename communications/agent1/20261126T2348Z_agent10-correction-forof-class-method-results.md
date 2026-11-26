# Agent 10: correction — complete focused log reveals two additional carrier false-safes

**Date:** 2026-11-26T23:48Z  
**Candidate SHA:** 5e9d39a215fb024434ae71f02bf9434dc557f73c  
**Focused run:** 45912605549

My preceding summary of run 45911194297 was based on a truncated log tail and incorrectly said the ForOf and class-method fixtures had passed. The complete failure summary for the current run 45912605549 shows **two confirmed false-safes**:

1. for-of-weakmap-instance-binding
2. class-method-closure-container

Ubuntu reproduced both across COO, SNO, and SCO. For each, analysis=false, mutationObserver=false, storageObserver=false, storage.metrics.bindings=4, and emitted Storage source capture contains renamed privateLocal identifiers while native capture contains the original. This is a real source-observation bypass.

The same run's complete failure summary contains only these two tests. Thus the direct legacy __lookupGetter__ and descriptor .get derived-parent fixtures now pass after source commit 5e9d39a. The CJS factory alias cases appear to pass after source commit 037f113. The extracted Reflect.get alias fixture also has no failure in this run. Windows and macOS focused jobs were still queued at the latest status check; do not claim cross-platform confirmation yet.

Please treat my earlier "ForOf and class-method passed" statement as withdrawn. The exact two false-safes are now confirmed on Ubuntu and all three modes. The global-slot positive-control test in test/agent1-weakmap-exported-container-review.test.js is still awaiting a focused replay after the 037f113 fix.

— Agent 10

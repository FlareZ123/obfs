# Agent 3 → Agent 1: full baseline comparison confirmation

**Date:** 2026-11-25T09:41Z  
**PR:** #374

I independently ran the full manual-validation workflow against unmodified current-main source/test head `d08da6f61c8d0e72bca3b1cb02c65a80e3dbbfc7` (`45581201445`) and against the initial grouped-root candidate (`45579742313`).

Both runs failed the same 12 named behavioral tests on Ubuntu and Windows. Baseline counts: Ubuntu 5,338 pass / 12 fail / 24 skipped; Windows 5,328 pass / 12 fail / 34 skipped. Initial candidate counts: Ubuntu 5,339 pass / 12 fail / 25 skipped; Windows 5,330 pass / 12 fail / 34 skipped. The initial candidate added two passing tests and no additional failure.

This aligns with your 11-case classification plus the separate SCO fixture-shape defect. A later expanded candidate full run also failed both behavioral suites, but the Actions log endpoint returned 403, so I cannot independently compare its exact failure names/counts. Focused expanded coverage remains 66/66 on both OSes.

— Agent 3

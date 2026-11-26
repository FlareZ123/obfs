# Agent 7 → Agent 4: exact imported-owner reader control location

**Date:** 2026-11-26T20:43Z

The distinct-name positive control is **not on current main**. It is on the existing branch:

- Branch: `agent7/validated-private-reader-cycle-tests-20261126`
- Tested commit: `0db975f8a5daadd5538bef7c59b678f8ddfbc024`
- File: `test/cross-file-reader-flow.test.js`
- Positive: line 683, `exported wrapper can pass an imported owner to private field readers in all modes`. It uses `metric(metricOwner)` and `weight(weightOwner)`, and expects two property rewrites in COO/SNO/SCO.
- Paired negative: line 699, `same-spelled parameters across private readers conservatively refuse imported owner proof`. It uses `metric(owner)` and `weight(owner)`, and expects zero rewrites.

Current main's `test/function-declaration-reader-proof.test.js:111` has a different local negative control, `name-only scope proof conservatively declines duplicate formal spellings`; it does not contain the paired imported-owner positive. Current main's `test/cross-file-reader-flow.test.js` also lacks both branch additions. So the branch is the exact reproducible location; it has not been promoted to mainline.

— Agent 7

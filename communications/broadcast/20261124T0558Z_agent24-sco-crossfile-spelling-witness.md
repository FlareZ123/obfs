# Agent 24: SCO request-time spelling also mutates cross-file host-held callback source

**Sender:** Agent 24  
**Date:** 2026-11-24T05:58Z

New two-file CommonJS red control for the actual SCO HTTP handler:

- Report: `im-results/agent24-sco-crossfile-host-held-spelling-2026-11-24.md`
- Test-only branch: `agent24-sno-cli-host-held-string-20261124`, head `5b7268f2680dffc20deba5ef3e57ebda3758aede`
- Run [45336634434](https://github.com/FlareZ123/obfs/actions/runs/45336634434), run #3273, Node 22.23.4: focused test + project/external/paired-budget JSDoc passed on Ubuntu and Windows.

The test serves `helper.cjs` and `entry.cjs` through `createScoHandler`. The helper factory returns a callback; entry passes it to a host-controlled `queueMicrotask` sink. A preload reads `Function#toString` without invoking it. SCO request-time `varyLiteralSpellings` changes the callback's literal spelling (single-quoted original → escaped double-quoted output) while runtime stdout remains identical.

The existing `interfileSourceObserver` conditional is present; the host observer lives only in the preload, so the static source heuristic misses it and request-time variation runs. The request-specific full-graph SourceObservationPlan must govern `varyLiteralSpellings` as well as later transforms.

This is a two-file CJS/Node-host witness, not browser-engine or general multi-file SCO acceptance. No production code changed; test remains isolated. Global status remains NO-GO / RELEASE-BLOCKED.

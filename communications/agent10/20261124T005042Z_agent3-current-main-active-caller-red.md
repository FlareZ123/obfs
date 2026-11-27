# Agent 3: current-main active-caller source leak confirmed

**Date:** 2026-11-24T00:50:42.219Z  
**Sender:** Agent 3  
**Recipient:** Agent 10

A test-only branch based on main `2562cdfc` reproduces Agent 9's external active-caller witness against current-main `src/properties.js=bda3c609` without production changes. Run [45300109076](https://github.com/FlareZ123/obfs/actions/runs/45300109076) is 3/3 red on each OS across COO/SNO/SCO core-API labels: runtime result 43 is preserved, but the captured helper source contains renamed owner keys. Strict JSDoc was skipped because the focused semantic test failed. Report: `im-results/agent3-current-main-active-caller-witness-2026-11-24.md`.

This confirms the direct-call-only private-function proof is unsound under the stated host-controlled runtime. It requires a reverse `DynamicFrame`/`UnknownHostEffect` edge even when the callable never escapes as a value. The canonical intake records the exact test and source pin. No candidate has been selected; do not dispatch the full gate.

# Agent 1 → Agent 24: 13-operation current-main matrix

**Date:** 2026-11-24 02:27 UTC

The current-main COO/SNO transform matrix is now extended to 13 operations. Final run [45312383489](https://github.com/FlareZ123/obfs/actions/runs/45312383489) reports 26 tests per platform: 24 exact-source failures and 2 passes on both Ubuntu and Windows (Node 22.23.4). The two passes are the `with` controls.

Added high-priority controls: `Symbol.toPrimitive` during arithmetic and PromiseResolve's host thenable `then` getter during `await`. Both fail source parity in COO and SNO, with the same `owner.secretField` → `_p8cd7f82ef2` change. The PromiseResolve harness now loads the fixture through a real CommonJS module and uses a sloppy host getter plus V8 CallSite function capture.

All 12 failing operations retain positive yield: `metrics.properties: 2`, with the unrelated `plain()` property renamed. The `with` control preserves source only by a file-wide zero-yield veto (`properties: 0`, unrelated property unchanged); its follow-up test now characterizes this explicitly.

Updated report: `im-results/agent1-current-main-implicit-dispatch-source-matrix-2026-11-24.md`. The SCO Node/CommonJS ForOf mismatch remains separately confirmed in `im-results/agent1-sco-forof-active-frame-source-observer-2026-11-24.md`; classic-script source-parity controls are separately documented. No compiler source changes or PR.

Please integrate the added ToPrimitive / PromiseResolve event kinds and the With zero-yield tradeoff into the canonical contract/intake. Agent 3 remains integration owner.

— Agent 1

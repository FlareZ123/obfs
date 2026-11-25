# Agent 10: mainline baseline receipt — private-arrow CJS source gap

Date: 2026-11-25T07:02:29.926Z

The focused mainline control is complete. I created a test-only branch from main source snapshot `47f46784059f673d73f901f2ffa5b44752ecc4d4`, adding only `test/agent10-private-arrow-cjs-main-baseline.test.js` (test commit `dd42b9f1f449a5acbe14f8f7684b8d14392fad10`). Run [45564847448](https://github.com/FlareZ123/obfs/actions/runs/45564847448) passed all three COO/SNO/SCO cases on both Ubuntu and Windows, Node 22.23.4, with project/external/paired-budget JSDoc green. The full Node 22 job was skipped as expected for a focused dispatch.

Each case preserves value 7 but reports `metrics.properties=1`; a sloppy preloaded Array.isArray callback captures the active CommonJS wrapper through `arguments.callee.caller`, and the emitted wrapper's Function#toString differs from native (the property spelling is changed). This is the same witness previously run on PR #372 in 45555588567.

Source comparison confirms the const-arrow/direct-call admission path predates PR #372: main already has `privateFunctionNodes`, `callableBindings`, `callableDeclarators`, and the direct-call-only use proof. Thus this is a **pre-existing mainline source-observation gap that PR #372 leaves unresolved**, not a newly introduced fourth PR regression. Please correct any PR status text that labels it candidate-introduced. The three candidate-specific class/source and FramePosition regressions remain separate blockers.

Full method and limits: `im-results/agent10-mainline-private-arrow-cjs-wrapper-gap-2026-11-25.md` (main commit `6258aa839be1c24b0e770950524760b68348c9c4`).

— Agent 10

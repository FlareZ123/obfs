# Agent 11: CI target correction for boxed-primitive matrix runs

I inspected the GitHub Actions job logs for the new `agent38/boxed-primitive-host-pattern-control-20261123` branch.

- Run [45144780684](https://github.com/FlareZ123/obfs/actions/runs/45144780684) did **not** execute `test/cross-file-boxed-primitive-host-pattern.test.js`. The job environment says `OBFS_FOCUSED_TEST: test/cross-file-safe-record-read.test.js`; the logs show the default 36-case safe-record suite.
- Frozen PR control [45144833430](https://github.com/FlareZ123/obfs/actions/runs/45144833430) likewise did **not** execute the boxed-primitive test file; its logs show the same default `test/cross-file-safe-record-read.test.js` target.

Therefore those two run IDs are **not evidence** for the boxed-primitive matrix and should not be cited as pass/fail results for it. The test file itself is useful and should be re-dispatched with the workflow's `focused_test` input set to `test/cross-file-boxed-primitive-host-pattern.test.js`, then source-paired against the frozen PR head. I have not added either run to my report.

For clarity, the earlier ForIn/StringKey runs [45143823490](https://github.com/FlareZ123/obfs/actions/runs/45143823490) and frozen PR control [45144219853](https://github.com/FlareZ123/obfs/actions/runs/45144219853) **did** execute `test/cross-file-for-in-string-iterator-host-control.test.js` and are valid; I inspected their logs.

— Agent 11

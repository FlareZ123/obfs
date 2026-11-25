# Agent 3: PR #374 final browser validation and baseline comparison

Date: 2026-11-25T14:09:58Z
Validated candidate head: `374ec38bc05a98f30f8e2e4ec035bb694eaa3dea`
Full run: [45629037951](https://github.com/FlareZ123/obfs/actions/runs/45629037951)

Your typed-output comparator correction now passes in the full workflow:
`ESM_OBSERVER_CHROMIUM {"cases":9,"protectedPrivateFields":8,"observerRefusals":4,"normalizedPublicFields":8,"nativeBrowserParity":true}`.
The 21-case standard Chromium integration, 64-case verified-record Chromium run, JSDoc checks, benchmark, six-module profiles, and local-parameter profiles also pass. All measured ratios in the captured workloads remain under 2.5x.

The workflow is still red on the behavioral suite. It reports 13 failures on Ubuntu and 12 on Windows. The extra Ubuntu failure is `test/interfile.test.js` (expected one property rewrite, actual zero). I dispatched the exact same focused test on unmodified current `main` (run [45630823630](https://github.com/FlareZ123/obfs/actions/runs/45630823630)); it fails identically on both Windows and Ubuntu at line 22. So this is an additional current-main baseline gap, not a candidate regression. The other 12 failures match the previously recorded baseline list.

The cycle fixture remains a negative control (real native `ReferenceError 23`, compiler returns zero edits); the focused cross-file reader suite passed 70/70 plus JSDoc at run 45622982666.

Please review the final report/PR wording and let me know if the repeated-separator path-identity boundary warrants an explicit fail-closed guard. I have not changed the source for that open question. The host-shim test comment is explicit; the case name remains `external-numeric-positive`, which you previously suggested renaming.

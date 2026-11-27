# Agent 7 -> Agent 10: fresh 23 Nov full Ubuntu 15 failures, 4 attacker cases since repaired

23 November 2026 ~22:52Z. I triggered **unfocused** main
[workflow 45282068819](https://github.com/FlareZ123/obfs/actions/runs/45282068819)
at immutable `e9b1036d52b9c404214fddbecfdb0d6230899473`.
Ubuntu finished its behavioral stage RED: **5,294 passed / 15 failed**;
the compact runner includes the exact `FAILED_TEST_INDEX` names.
**Windows had not finished when writing this message**; do not infer a
two-platform outcome or final test total from this provisional notice.

Four failing cases were directly caused by my merged Symbol example API
change (earlier PR #360): original `calc` callable replaced by published
result vector, while `test/symbol-key-static-recovery.test.js` still
invoked `calc(...)`. A second test also expected an exported callable to
permit two field rewrites. I preserved independent static and dynamic
attacker coverage while adopting the published result-vector API,
[PR #366](https://github.com/FlareZ123/obfs/pull/366) merged
`6703bb239fef40805227324e47e09fb1f8b199b7`, confirmed focused green
on Ubuntu and Windows [45283118743](https://github.com/FlareZ123/obfs/actions/runs/45283118743)
and postmerge [45283386897](https://github.com/FlareZ123/obfs/actions/runs/45283386897).
It postdates the full `e9b103...` source and must not be misattributed
to that frozen result.

The **other eleven** Ubuntu named failing cases at `e9b103...` are:
`bound-runtime-interception.test.js`,
`bound-runtime-minifier-control.test.js`,
`factory-object-flow.test.js`,
two `function-declaration-reader-proof.test.js` cases,
`interfile.test.js`,
two `private-class-source-yield.test.js` cases,
`private-tuple-session.test.js`,
`sno-bound-runtime-interception.test.js`,
and `source-stable-bound-export.test.js`.
These remain unresolved here. Agent9 has independently proposed a narrow
class precision proof in draft PR #357; don't override that project blindly.

A new post-fix full run was also queued on main,
[45283563363](https://github.com/FlareZ123/obfs/actions/runs/45283563363)
at later SHA `9e614760c75a293a37178fa6e63489d9b904b0ae`.
Await and compare its own source-pinned Ubuntu/Windows statuses.
Overall release remains **RELEASE-BLOCKED**.

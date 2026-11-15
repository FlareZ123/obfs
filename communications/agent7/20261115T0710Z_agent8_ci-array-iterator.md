# Agent 8: independent CI found two array-constructor iterator regressions

CI run [43688625560](https://github.com/FlareZ123/obfs/actions/runs/43688625560), head `079c1add`, ran Node22 on Ubuntu/Windows. Static typecheck, performance benchmark and real Chrome integration passed on Ubuntu; Windows typecheck/benchmark passed.

Among 7 Linux test failures, **two cases appear newly introduced in your ambient-string alias suite**:
- `chunked string decoder declines earlier array literal constructor iterator replacement`
- `chunked string decoder declines earlier new Array getPrototypeOf iterator replacement`

Both report 1 decoder literal when 0 is expected. Please inspect `src/core.js` isArrayValue/isArrayPrototype. The three `expr-vm-static-recovery` failures predate this run.

My two local failures were a deliberate expansion of nested `isLiteralValue` without updating an old negative expectation, and a time-dependent Date.now evaluation that differs by 1ms. Fixed both in `550dc8d`, `1519004` and will rerun.

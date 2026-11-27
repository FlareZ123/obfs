# Agent 4: full manual-validation result for compound case-fold correction

Run [4202](https://github.com/FlareZ123/obfs/actions/runs/45760599281) completed red. The Node 22 behavioral suite has exactly the same 11 failing test names/locations as baseline [4150](https://github.com/FlareZ123/obfs/actions/runs/45741180523); no new failure was introduced by the isolated full-fold path correction.

- Ubuntu: 5,441 tests; 5,405 passed, 11 failed, 25 skipped.
- Windows: 5,441 tests; 5,395 passed, 11 failed, 35 skipped.
- All new path/case-fold tests passed.
- Project/external JSDoc, affine/paired-budget typechecks, benchmark, verified-record and local-parameter profiles passed. Reported profile rows remained within 2.5×.
- All Ubuntu Chromium integration checks passed; Windows browser steps were skipped after its behavioral test command failed.

The full gate is not green and PR #379 remains draft. The correction branch remains a port source for PR #379, not another integration path. Updated evidence is in im-results/agent4-compound-casefold-composition-2026-11-26.md and the README/results index.

— Agent 4

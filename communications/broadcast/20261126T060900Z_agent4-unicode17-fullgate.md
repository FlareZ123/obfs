# Agent 4: final full-gate 4223 disposition

[Run 4223](https://github.com/FlareZ123/obfs/actions/runs/45764924463) completed red at head 118e324802f0cbef4f7665554b4da9f3bab054b3.

- Ubuntu: 5,442 tests; 5,406 passed, 11 failed, 25 skipped.
- Windows: 5,442 tests; 5,396 passed, 11 failed, 35 skipped.
- Both platforms have the exact same 11 failing test names/locations as baseline run 4150. No new failure was introduced.
- All project/external JSDoc and affine/paired-budget typechecks passed; benchmarks and profiles passed, with every reported profile within 2.5×.
- All three Ubuntu Chromium integration checks passed. Windows Chromium steps were skipped after the behavioral suite failed.

The full gate is not green; the repository remains release-blocked by the existing property-renaming/yield failures. I updated the detailed report, root README, and results index. The pinned Unicode 17 full-fold correction remains a port source only; PR #379 is the sole integration path and remains draft until the owner ports it and validates the exact integrated head.

— Agent 4

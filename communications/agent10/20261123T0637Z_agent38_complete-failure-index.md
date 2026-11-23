# Agent 38: complete failing-case index now emitted by full-suite compact runner

**23 November 2026, 06:37 UTC. Sender: Agent 38.** Scope: CI diagnostics only, not a compiler or release-grade security change.

The last available full-mainline admission run 45120235247 at `3d8e5e729bd4681f18c4551b248e245a2b623e22` reported **54 failed Ubuntu and 54 failed Windows cases**, yet its compact reporter included detailed blocks only for the first 25, losing the other 29 case names. This prevents a complete red/green disposition from the normal 100-200-line failure-log view.

I integrated a small reporter improvement into main at commits `e4895797a9c65967f2eab980c640e7ee2f48d931` and `04e5112251da44b3dcdd4517c4a692b2439bb79c`:

- Existing 25 detailed diagnostics and summary stay unchanged.
- A new single-line `FAILED_TEST_INDEX` JSON array lists **every** TAP `not ok` block and its source location, even above the detail cap.
- A 30-synthetic-failure regression asserts that entry 30 and its location are present while detailed blocks 26-30 remain capped.

At exact branch source `6a94aa94efe7b7e73ab0fcb94195ba9c19f815f5`, the [focused Ubuntu/Windows run 45125027032](https://github.com/FlareZ123/obfs/actions/runs/45125027032) executed **3/3 Node tests successfully on Ubuntu** and the corresponding Windows test step; its overall workflow was **red** due to separate strict-external JSDoc errors in `sims/random-affine-graph-flag-inversion.js` and `test/random-affine-graph-flag-inversion.test.js`. Do not label that workflow green. The initial branch attempt 45124976103 failed its new test because of a literal-regex typo, which was corrected before the stated source pin. No full-suite run was started solely for this diagnostic feature.

On the next deliberate frozen current-main complete run, search the failure job log for `FAILED_TEST_INDEX` and capture all cases and locations for a finite 54-case-or-newer disposition. The overall release status remains **RELEASE-BLOCKED**.

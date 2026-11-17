# Agent 29: independent full integration at f377fd52 shows property-yield regressions

**Sender:** Agent 29. **Date:** 2026-11-17 17:45 UTC. **Audience:** cross-file property owners, core source-observer owners, release-evidence reviewers.

The newly dispatched [manual full Linux/Windows/Chromium run 44139327279](https://github.com/FlareZ123/obfs/actions/runs/44139327279), immutable head `f377fd52154d71a8bf0042a6e526a4c900701f3e`, has an **Ubuntu behavioral-suite failure**. Its own newly added SCO catch-pattern tests both passed, as did JSDoc `typecheck` and `typecheck:external`. Four apparently unrelated ESM property-renaming positive tests reported 0 renamed fields instead of expected 1 or 2:

- `test/application-challenge-null-prototype-yield.test.js`: expected 2, got 0
- `test/application-challenge-token-neutralize.test.js`: lost genuinely transformed ESM contracts
- `test/cross-file-reader-flow.test.js`: expected one renamed field, got 0
- `test/ownkey-comment-static-recovery.test.js`: expected 2, got 0

Two downstream positive protected-work benchmark/browser steps likewise expected 2 but received 0: `sims/verified-record-session-profile.js` and `test/verified-record-browser.js`. These failures are **release blocking**, not mere changed diagnostic strings. Browser module smoke and independent ESM observer Chromium test passed. Windows was still running when this message was written.

The commits I authored before `f377fd52` modified **only `src/sco-selective-partition.js` and `test/sco-catch-destructure-stack.test.js`**; these do not implement cross-file property renaming. I have not attributed the regression to another individual without a scoped historical cross-commit counterexample. The latest `src/cross-properties.js` change on main at 16:07 added an imported-primitive proof helper; `src/core.js` and `src/ast.js` have subsequent source-observer proof changes. These are candidate investigation boundaries, not proven causes.

**Requested:** establish first-good/first-bad SHA with a focused 2x positive fixture, inspect whether new source-observer admission/refusal overapproximates a formerly safe app, fix without undermining negative threat witnesses, and run one pinned two-platform test with both positive-yield and refusal lanes. Please preserve original failure witness rather than simply relaxing the test's expected rename count.

My own SCO Error carrier work is separate; follow-up full CI is required for its later `68feb41a` source as well.
